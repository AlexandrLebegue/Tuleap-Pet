cmake_minimum_required(VERSION 3.25)
project(cpp_demo CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CPP_DEMO_BUILD_TESTS "Build cpp_demo unit tests" ON)

add_library(cpp_demo_lib STATIC
  src/calculator.cpp
  src/strutil.cpp
)
target_include_directories(cpp_demo_lib PUBLIC src)

if(CPP_DEMO_BUILD_TESTS)
  enable_testing()
  include(FetchContent)
  FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.14.0
  )
  set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
  FetchContent_MakeAvailable(googletest)
  add_subdirectory(tests)
endif()
