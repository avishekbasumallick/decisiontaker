"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/decamelize";
exports.ids = ["vendor-chunks/decamelize"];
exports.modules = {

/***/ "(rsc)/./node_modules/decamelize/index.js":
/*!******************************************!*\
  !*** ./node_modules/decamelize/index.js ***!
  \******************************************/
/***/ ((module) => {

eval("\nmodule.exports = function(str, sep) {\n    if (typeof str !== \"string\") {\n        throw new TypeError(\"Expected a string\");\n    }\n    sep = typeof sep === \"undefined\" ? \"_\" : sep;\n    return str.replace(/([a-z\\d])([A-Z])/g, \"$1\" + sep + \"$2\").replace(/([A-Z]+)([A-Z][a-z\\d]+)/g, \"$1\" + sep + \"$2\").toLowerCase();\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvZGVjYW1lbGl6ZS9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBQTtBQUNBQSxPQUFPQyxPQUFPLEdBQUcsU0FBVUMsR0FBRyxFQUFFQyxHQUFHO0lBQ2xDLElBQUksT0FBT0QsUUFBUSxVQUFVO1FBQzVCLE1BQU0sSUFBSUUsVUFBVTtJQUNyQjtJQUVBRCxNQUFNLE9BQU9BLFFBQVEsY0FBYyxNQUFNQTtJQUV6QyxPQUFPRCxJQUNMRyxPQUFPLENBQUMscUJBQXFCLE9BQU9GLE1BQU0sTUFDMUNFLE9BQU8sQ0FBQyw0QkFBNEIsT0FBT0YsTUFBTSxNQUNqREcsV0FBVztBQUNkIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vbmV4dGpzLy4vbm9kZV9tb2R1bGVzL2RlY2FtZWxpemUvaW5kZXguanM/NDI5YyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChzdHIsIHNlcCkge1xuXHRpZiAodHlwZW9mIHN0ciAhPT0gJ3N0cmluZycpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdFeHBlY3RlZCBhIHN0cmluZycpO1xuXHR9XG5cblx0c2VwID0gdHlwZW9mIHNlcCA9PT0gJ3VuZGVmaW5lZCcgPyAnXycgOiBzZXA7XG5cblx0cmV0dXJuIHN0clxuXHRcdC5yZXBsYWNlKC8oW2EtelxcZF0pKFtBLVpdKS9nLCAnJDEnICsgc2VwICsgJyQyJylcblx0XHQucmVwbGFjZSgvKFtBLVpdKykoW0EtWl1bYS16XFxkXSspL2csICckMScgKyBzZXAgKyAnJDInKVxuXHRcdC50b0xvd2VyQ2FzZSgpO1xufTtcbiJdLCJuYW1lcyI6WyJtb2R1bGUiLCJleHBvcnRzIiwic3RyIiwic2VwIiwiVHlwZUVycm9yIiwicmVwbGFjZSIsInRvTG93ZXJDYXNlIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/decamelize/index.js\n");

/***/ })

};
;