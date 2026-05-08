import * as React from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@renderer/components/ui/card'

function Settings(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h2 className="text-2xl font-semibold tracking-tight">Réglages</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connexion à votre instance Tuleap et choix du projet de travail.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Connexion Tuleap</CardTitle>
          <CardDescription>
            Saisissez l&apos;URL de votre instance et un token API personnel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Le formulaire arrive dans la prochaine étape (étape 9).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default Settings
