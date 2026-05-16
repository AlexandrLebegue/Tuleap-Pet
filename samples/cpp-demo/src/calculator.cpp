#include "calculator.h"

#include <stdexcept>

namespace calc {

int add(int a, int b) {
  return a + b;
}

int multiply(int a, int b) {
  return a * b;
}

int square(int x) {
  return multiply(x, x);
}

int sum(const std::vector<int>& v) {
  int total = 0;
  for (int x : v) {
    total = add(total, x);
  }
  return total;
}

double average(const std::vector<int>& v) {
  if (v.empty()) {
    return 0.0;
  }
  const int total = sum(v);
  return static_cast<double>(total) / static_cast<double>(v.size());
}

int max_element(const std::vector<int>& v) {
  if (v.empty()) {
    throw std::invalid_argument("max_element: empty vector");
  }
  int best = v[0];
  for (size_t i = 1; i < v.size(); ++i) {
    if (v[i] > best) {
      best = v[i];
    }
  }
  return best;
}

}
