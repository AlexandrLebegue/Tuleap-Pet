#include "strutil.h"

#include <algorithm>
#include <cctype>

namespace strutil {

/*----------------------------------------------------------------------------*/
/*! \brief Returns the input string converted to uppercase.
 *
 * Iterates over each character and folds it via std::toupper. The input is
 * never mutated; a fresh string is returned.
 *
 * \param [in] s : source string
 * \return uppercase copy of s
 */
/*----------------------------------------------------------------------------*/
std::string to_upper(const std::string& s) {
  std::string result = s;
  std::transform(result.begin(), result.end(), result.begin(),
                 [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
  return result;
}

/*----------------------------------------------------------------------------*/
/*! \brief Returns the input string converted to lowercase.
 *
 * Iterates over each character and folds it via std::tolower. The input is
 * never mutated; a fresh string is returned.
 *
 * \param [in] s : source string
 * \return lowercase copy of s
 */
/*----------------------------------------------------------------------------*/
std::string to_lower(const std::string& s) {
  std::string result = s;
  std::transform(result.begin(), result.end(), result.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return result;
}

/*----------------------------------------------------------------------------*/
/*! \brief Trims leading and trailing whitespace from a string.
 *
 * Scans the string from both ends to find the first and last non-whitespace
 * character, then returns the substring between them. An all-whitespace input
 * yields an empty string.
 *
 * \param [in] s : source string
 * \return s with surrounding whitespace removed
 */
/*----------------------------------------------------------------------------*/
std::string trim(const std::string& s) {
  const auto not_space = [](unsigned char c) { return !std::isspace(c); };
  const auto begin = std::find_if(s.begin(), s.end(), not_space);
  const auto end = std::find_if(s.rbegin(), s.rend(), not_space).base();
  if (begin >= end) {
    return std::string();
  }
  return std::string(begin, end);
}

}
