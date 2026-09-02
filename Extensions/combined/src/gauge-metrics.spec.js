import { buildEngagementMetric, parseAgeDays, parseVisibleCount } from "./gauge-metrics";

describe("Gauge visible-number parsing", () => {
  test.each([
    ["1,234 views", 1234],
    ["4.2K likes", 4200],
    ["1.5 million views", 1500000],
  ])("parses %s", (input, expected) => {
    expect(parseVisibleCount(input)).toBe(expected);
  });

  test("normalizes relative ages", () => {
    expect(parseAgeDays("2 weeks ago")).toBe(14);
    expect(parseAgeDays("3 hours ago")).toBeCloseTo(0.125);
  });

  test("calculates engagement and daily velocity", () => {
    expect(buildEngagementMetric({ likes: 500, views: 10000, ageDays: 10 })).toMatchObject({
      engagement: 5,
      likesPerDay: 50,
    });
  });

  test("does not invent a metric without visible values", () => {
    expect(buildEngagementMetric({ likes: null, views: 10000, ageDays: 10 })).toBeNull();
  });
});
