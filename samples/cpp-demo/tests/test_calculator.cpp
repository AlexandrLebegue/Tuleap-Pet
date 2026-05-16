#include "gtest/gtest.h"

#include "calculator.h"

TEST(CalculatorTest, AddBasic) {
  EXPECT_EQ(calc::add(2, 3), 5);
  EXPECT_EQ(calc::add(-1, 1), 0);
}

TEST(CalculatorTest, MultiplyBasic) {
  EXPECT_EQ(calc::multiply(4, 5), 20);
  EXPECT_EQ(calc::multiply(0, 7), 0);
}

TEST(CalculatorTest, SquareUsesMultiply) {
  EXPECT_EQ(calc::square(6), 36);
}
