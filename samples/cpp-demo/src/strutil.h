#pragma once

#include <string>

namespace strutil {

/*----------------------------------------------------------------------------*/
/*! \brief Returns the input string converted to uppercase.
 *
 * \param [in] s : source string
 * \return uppercase copy of s
 */
/*----------------------------------------------------------------------------*/
std::string to_upper(const std::string& s);

/*----------------------------------------------------------------------------*/
/*! \brief Returns the input string converted to lowercase.
 *
 * \param [in] s : source string
 * \return lowercase copy of s
 */
/*----------------------------------------------------------------------------*/
std::string to_lower(const std::string& s);

/*----------------------------------------------------------------------------*/
/*! \brief Trims leading and trailing whitespace from a string.
 *
 * \param [in] s : source string
 * \return s with surrounding whitespace removed
 */
/*----------------------------------------------------------------------------*/
std::string trim(const std::string& s);

}
