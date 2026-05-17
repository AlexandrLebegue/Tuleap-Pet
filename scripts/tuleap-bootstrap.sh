#!/usr/bin/env bash
#
# Provisionne une instance Tuleap fraîche (lancée via ci/tuleap-compose.yml)
# pour qu'elle soit prête à recevoir les tests d'intégration de Tuleap-Pet.
#
# Étapes :
#   1. Patche la conf nginx si IPv6 indisponible (cas VMs minimales) + restart.
#   2. Attend que l'API Tuleap réponde (https://localhost:8443/api/explorer/).
#   3. Vérifie les credentials admin via /api/users/self.
#   4. Génère un access_key (scope write:rest) via POST /api/access_keys.
#   5. Importe le projet `ci-test` depuis ci/tuleap-project-template.xml
#      (issu du plugin create_test_env de Tuleap) avec --automap.
#   6. Résout projectId + trackerId (Bug par défaut) via l'API REST.
#   7. Exporte TULEAP_URL / TULEAP_TOKEN / TULEAP_PROJECT_ID / TULEAP_TRACKER_ID
#      dans $GITHUB_ENV (si défini) et dans .tuleap-test.env (toujours).
#
# Variables requises :
#   SITE_ADMINISTRATOR_PASSWORD   mot de passe `admin` posé via compose
#   CI_USER_PASSWORD              mot de passe pour l'API (défaut: SITE_ADMINISTRATOR_PASSWORD)
#   TULEAP_URL                    URL de l'instance (défaut: https://localhost:8443)
#   TULEAP_CONTAINER              nom du container Tuleap (défaut: tuleap-pet-tuleap)
#
set -euo pipefail

TULEAP_URL=${TULEAP_URL:-https://localhost:8443}
TULEAP_CONTAINER=${TULEAP_CONTAINER:-tuleap-pet-tuleap}
# Tuleap 17 n'expose pas de commande `tuleap user-add` côté CLI. Pour éviter
# d'aller chercher des hacks SQL/XML qui dérivent à chaque version, on
# utilise directement l'utilisateur `admin` (créé par l'image avec
# SITE_ADMINISTRATOR_PASSWORD) comme acteur des tests.
CI_USER_LOGIN=${CI_USER_LOGIN:-admin}
CI_USER_PASSWORD=${CI_USER_PASSWORD:-${SITE_ADMINISTRATOR_PASSWORD:-}}
PROJECT_SHORTNAME=${PROJECT_SHORTNAME:-ci-test}
TEMPLATE_PATH=${TEMPLATE_PATH:-ci/tuleap-project-template.xml}
HEALTH_TIMEOUT_SEC=${HEALTH_TIMEOUT_SEC:-600}

: "${SITE_ADMINISTRATOR_PASSWORD:?SITE_ADMINISTRATOR_PASSWORD must be set}"
: "${CI_USER_PASSWORD:?CI_USER_PASSWORD or SITE_ADMINISTRATOR_PASSWORD must be set}"

log() { printf '[bootstrap] %s\n' "$*" >&2; }

curl_tuleap() {
  curl -k -sS "$@"
}

# Quand le kernel hôte n'a pas IPv6 (cas typique de certaines VMs / runners
# minimaux), nginx fail à bind sur [::]:443. On patche la conf et on relance
# nginx via supervisorctl. Sur un hôte IPv6-capable (GH Actions ubuntu-latest)
# ce patch est innocent (nginx tourne déjà, le restart est rapide).
patch_nginx_if_needed() {
  log "Vérification du support IPv6 dans le container…"
  if docker exec "${TULEAP_CONTAINER}" test -e /proc/sys/net/ipv6/conf/all/disable_ipv6; then
    log "IPv6 disponible — pas de patch nginx requis."
    return
  fi
  log "IPv6 indisponible — patch des fichiers nginx (suppression de tous les listen [::]:…)…"
  docker exec "${TULEAP_CONTAINER}" sed -i '/listen\s*\[::\]:/d' /etc/nginx/conf.d/tuleap.conf
  docker exec "${TULEAP_CONTAINER}" sed -i '/listen\s*\[::\]:/d' /etc/nginx/nginx.conf
  # supervisorctl exige des credentials random — plus simple de restarter le container,
  # ce qui rejoue le boot complet avec la config patchée (et la DB déjà initialisée).
  log "Restart du container pour appliquer le patch nginx…"
  docker restart "${TULEAP_CONTAINER}" >/dev/null
}

wait_for_tuleap_api() {
  log "Attente que ${TULEAP_URL}/api/explorer/ réponde (timeout ${HEALTH_TIMEOUT_SEC}s)…"
  local elapsed=0
  while (( elapsed < HEALTH_TIMEOUT_SEC )); do
    if curl_tuleap -o /dev/null -f "${TULEAP_URL}/api/explorer/" >/dev/null 2>&1; then
      log "Tuleap répond après ${elapsed}s."
      return 0
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  log "Tuleap n'a pas démarré dans le délai imparti."
  return 1
}

ensure_ci_user() {
  # Aucune création — on utilise `admin` posé par l'image au boot.
  # On vérifie juste que le password est OK via /api/users/self.
  log "Vérification credentials ${CI_USER_LOGIN} sur ${TULEAP_URL}…"
  local status
  status=$(curl_tuleap -o /dev/null -w '%{http_code}' \
    -u "${CI_USER_LOGIN}:${CI_USER_PASSWORD}" \
    "${TULEAP_URL}/api/users/self" || echo "000")
  if [[ "${status}" != "200" ]]; then
    log "Login ${CI_USER_LOGIN} refusé (HTTP ${status})"
    return 1
  fi
  log "Credentials ${CI_USER_LOGIN} OK."
}

generate_access_key() {
  log "Génération d'un access_key pour ${CI_USER_LOGIN} via /api/access_keys…"
  local body resp identifier
  body=$(jq -n \
    --arg desc "ci-bootstrap-$(date +%s)" \
    --arg scope "write:rest" \
    '{description: $desc, scopes: [$scope]}')
  resp=$(curl_tuleap -X POST \
    -u "${CI_USER_LOGIN}:${CI_USER_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    "${TULEAP_URL}/api/access_keys")
  identifier=$(printf '%s' "${resp}" | jq -er '.identifier' 2>/dev/null || true)
  if [[ -z "${identifier}" || "${identifier}" == "null" ]]; then
    log "Échec création access_key. Réponse brute :"
    printf '%s\n' "${resp}" >&2
    return 1
  fi
  printf '%s' "${identifier}"
}

import_project() {
  log "Import du projet via import-project-xml…"
  # Tuleap valide l'XML contre un RelaxNG strict. On part du template
  # `sample-project/project.xml` (extrait via docker cp lors de la mise en
  # place du repo, voir ci/tuleap-project-template.xml) et on substitue les
  # placeholders Twig avant l'import.
  docker exec "${TULEAP_CONTAINER}" rm -rf /tmp/ci-test-import
  docker exec "${TULEAP_CONTAINER}" mkdir -p /tmp/ci-test-import

  # Substitue les variables Twig dans une copie locale temporaire.
  local tmp_xml
  tmp_xml=$(mktemp)
  sed \
    -e "s/{{ project_unix_name }}/${PROJECT_SHORTNAME}/g" \
    -e "s/{{ project_full_name }}/CI Test Project/g" \
    -e "s/{{ username }}/${CI_USER_LOGIN}/g" \
    -e "s/{{ current_date }}/$(date -u +%FT%TZ)/g" \
    "${TEMPLATE_PATH}" > "${tmp_xml}"

  docker cp "${tmp_xml}" "${TULEAP_CONTAINER}:/tmp/ci-test-import/project.xml"
  rm -f "${tmp_xml}"

  # Le users.xml doit mapper chaque user référencé dans project.xml vers un
  # user existant. On résout l'id de admin via l'API REST.
  local admin_id admin_real_name admin_email
  local admin_json
  admin_json=$(curl_tuleap -u "${CI_USER_LOGIN}:${CI_USER_PASSWORD}" \
    "${TULEAP_URL}/api/users/self")
  admin_id=$(printf '%s' "${admin_json}" | jq -er '.id')
  admin_real_name=$(printf '%s' "${admin_json}" | jq -er '.real_name // "Site Administrator"')
  admin_email=$(printf '%s' "${admin_json}" | jq -er '.email // "admin@example.com"')

  local users_xml
  users_xml=$(mktemp)
  cat > "${users_xml}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<users>
  <user>
    <id>${admin_id}</id>
    <username>${CI_USER_LOGIN}</username>
    <realname>${admin_real_name}</realname>
    <email>${admin_email}</email>
    <ldapid></ldapid>
  </user>
</users>
EOF
  docker cp "${users_xml}" "${TULEAP_CONTAINER}:/tmp/ci-test-import/users.xml"
  rm -f "${users_xml}"

  if docker exec "${TULEAP_CONTAINER}" /usr/share/tuleap/src/utils/tuleap import-project-xml \
      --user-name=admin \
      --automap=no-email,create:S \
      --archive-path=/tmp/ci-test-import 2>/tmp/import.err 1>&2; then
    log "Projet importé."
    return
  fi
  # `Short name already exists` ou variantes -> idempotent
  if grep -qi "Short name already exists\|already exists\|already imported\|déjà" /tmp/import.err; then
    log "Projet ${PROJECT_SHORTNAME} déjà présent — on continue."
    return
  fi
  log "Échec import :"
  cat /tmp/import.err >&2
  return 1
}

resolve_ids() {
  local token="$1"
  log "Résolution projectId pour shortname=${PROJECT_SHORTNAME}…"
  local projects project_id tracker_id query
  query=$(jq -cn --arg sn "${PROJECT_SHORTNAME}" '{shortname: $sn}' | jq -sRr @uri)
  projects=$(curl_tuleap \
    -H "X-Auth-AccessKey: ${token}" \
    "${TULEAP_URL}/api/projects?limit=50&query=${query}")
  project_id=$(printf '%s' "${projects}" | jq -er '.[0].id' 2>/dev/null || true)
  if [[ -z "${project_id}" || "${project_id}" == "null" ]]; then
    log "Projet introuvable, dump :"
    printf '%s\n' "${projects}" >&2
    return 1
  fi
  log "projectId=${project_id}, résolution trackerId…"
  local trackers
  trackers=$(curl_tuleap \
    -H "X-Auth-AccessKey: ${token}" \
    "${TULEAP_URL}/api/projects/${project_id}/trackers?limit=50")
  # Priorité au tracker Bug (sample-project), puis n'importe quel premier tracker.
  tracker_id=$(printf '%s' "${trackers}" | jq -er '.[] | select(.item_name=="bug") | .id' 2>/dev/null | head -n1 || true)
  if [[ -z "${tracker_id}" || "${tracker_id}" == "null" ]]; then
    tracker_id=$(printf '%s' "${trackers}" | jq -er '.[0].id' 2>/dev/null || true)
  fi
  if [[ -z "${tracker_id}" || "${tracker_id}" == "null" ]]; then
    log "Tracker introuvable, dump :"
    printf '%s\n' "${trackers}" >&2
    return 1
  fi
  printf '%s %s' "${project_id}" "${tracker_id}"
}

export_env() {
  local token="$1" project_id="$2" tracker_id="$3"
  {
    printf 'TULEAP_URL=%s\n' "${TULEAP_URL}"
    printf 'TULEAP_TOKEN=%s\n' "${token}"
    printf 'TULEAP_PROJECT_ID=%s\n' "${project_id}"
    printf 'TULEAP_TRACKER_ID=%s\n' "${tracker_id}"
  } > .tuleap-test.env
  log "Écrit .tuleap-test.env"
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    {
      printf 'TULEAP_URL=%s\n' "${TULEAP_URL}"
      printf 'TULEAP_TOKEN=%s\n' "${token}"
      printf 'TULEAP_PROJECT_ID=%s\n' "${project_id}"
      printf 'TULEAP_TRACKER_ID=%s\n' "${tracker_id}"
    } >> "${GITHUB_ENV}"
    log "Exporté dans \$GITHUB_ENV"
  fi
}

main() {
  patch_nginx_if_needed
  wait_for_tuleap_api
  ensure_ci_user
  local token
  token=$(generate_access_key)
  import_project
  local ids project_id tracker_id
  ids=$(resolve_ids "${token}")
  project_id=$(printf '%s' "${ids}" | awk '{print $1}')
  tracker_id=$(printf '%s' "${ids}" | awk '{print $2}')
  export_env "${token}" "${project_id}" "${tracker_id}"
  log "Bootstrap terminé. URL=${TULEAP_URL} project=${project_id} tracker=${tracker_id}"
}

main "$@"
