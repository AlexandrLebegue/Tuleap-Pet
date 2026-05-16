include(GoogleTest)

add_executable(cpp_demo_tests
  test_calculator.cpp
)

target_link_libraries(cpp_demo_tests
  PRIVATE
    cpp_demo_lib
    GTest::gtest_main
)

gtest_discover_tests(cpp_demo_tests)
