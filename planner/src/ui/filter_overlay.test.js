import { describe, it, expect } from "vitest";
import { computeOverlayBlocks, computeTimelineRange, computeColumnOverlayBlocks } from "./filter_overlay.js";

// Baseline grid state used in most cases: 8am–6pm axis (600 minutes),
// 1000px vertical span starting at y=30, five-day M–F layout with 100px
// per day column starting at x=80.
const baselineGrid = {
  minTime: 8 * 60, // 480
  maxTime: 18 * 60, // 1080
  axisTopPx: 30,
  axisBottomPx: 1030, // axisHeight = 1000
  dayBounds: [
    { day: "M", left: 80, width: 100 },
    { day: "T", left: 180, width: 100 },
    { day: "W", left: 280, width: 100 },
    { day: "Th", left: 380, width: 100 },
    { day: "F", left: 480, width: 100 },
  ],
  half: "A71",
};

function filter(overrides) {
  return {
    id: 1,
    name: "gym",
    days: ["M", "W", "F"],
    start: 12 * 60, // 720
    end: 19 * 60, // 1140
    session: "AD",
    visible: true,
    pattern: "solid",
    color: "#8F2D1E",
    ...overrides,
  };
}

describe("computeOverlayBlocks — basic geometry", () => {
  it("renders one block per applicable day with proportional top/height", () => {
    const blocks = computeOverlayBlocks([filter({})], baselineGrid);
    expect(blocks.map((b) => b.day)).toEqual(["M", "W", "F"]);
    // start=720 clips to min(720, maxTime=1080)=720. end=1140 clips to 1080.
    // Clipped range = [720, 1080] → ratio within [480, 1080] = [0.4, 1.0].
    // Top: 30 + 0.4 * 1000 = 430. Height: 0.6 * 1000 = 600.
    for (const b of blocks) {
      expect(b.top).toBe(430);
      expect(b.height).toBe(600);
      expect(b.width).toBe(100);
      expect(b.pattern).toBe("solid");
      expect(b.color).toBe("#8F2D1E");
      expect(b.name).toBe("gym");
    }
    // Day columns picked up correctly
    expect(blocks.find((b) => b.day === "M").left).toBe(80);
    expect(blocks.find((b) => b.day === "W").left).toBe(280);
    expect(blocks.find((b) => b.day === "F").left).toBe(480);
  });
});

describe("computeOverlayBlocks — visibility", () => {
  it("returns [] when the filter has visible:false", () => {
    const blocks = computeOverlayBlocks([filter({ visible: false })], baselineGrid);
    expect(blocks).toEqual([]);
  });
  it("returns [] when no filters are supplied", () => {
    expect(computeOverlayBlocks([], baselineGrid)).toEqual([]);
    expect(computeOverlayBlocks(null, baselineGrid)).toEqual([]);
  });
});

describe("computeOverlayBlocks — session matching", () => {
  it("skips filters whose session doesn't match the half (AD always matches)", () => {
    const blocks = computeOverlayBlocks(
      [
        filter({ id: 1, session: "AD" }),      // matches both halves
        filter({ id: 2, session: "A71" }),     // matches
        filter({ id: 3, session: "A72" }),     // skipped
      ],
      { ...baselineGrid, half: "A71" },
    );
    const ids = new Set(blocks.map((b) => b.filterId));
    expect(ids.has(1)).toBe(true);
    expect(ids.has(2)).toBe(true);
    expect(ids.has(3)).toBe(false);
  });
});

describe("computeOverlayBlocks — clipping to grid bounds", () => {
  it("clips a filter whose time extends beyond the rendered axis (below max)", () => {
    // Filter 6am-10pm, grid axis 8am-6pm → clipped to 8am-6pm.
    const blocks = computeOverlayBlocks(
      [filter({ start: 6 * 60, end: 22 * 60, days: ["M"] })],
      baselineGrid,
    );
    expect(blocks).toHaveLength(1);
    // Clipped = [480, 1080] → ratio [0, 1] → top=30, height=1000.
    expect(blocks[0].top).toBe(30);
    expect(blocks[0].height).toBe(1000);
  });

  it("clips a filter whose start is before the axis but end is inside", () => {
    const blocks = computeOverlayBlocks(
      [filter({ start: 6 * 60, end: 10 * 60, days: ["T"] })], // 6am–10am
      baselineGrid,
    );
    expect(blocks).toHaveLength(1);
    // Clipped = [480, 600] → ratio [0, 0.2] → top=30, height=200.
    expect(blocks[0].top).toBe(30);
    expect(blocks[0].height).toBe(200);
  });

  it("returns [] when the filter range is entirely outside the axis (above max)", () => {
    const blocks = computeOverlayBlocks(
      [filter({ start: 20 * 60, end: 22 * 60, days: ["M"] })], // 8pm–10pm
      baselineGrid,
    );
    expect(blocks).toEqual([]);
  });

  it("returns [] when the filter range is entirely outside the axis (below min)", () => {
    const blocks = computeOverlayBlocks(
      [filter({ start: 5 * 60, end: 7 * 60, days: ["M"] })], // 5am–7am
      baselineGrid,
    );
    expect(blocks).toEqual([]);
  });
});

describe("computeOverlayBlocks — multi-day + days-not-shown", () => {
  it("renders a block on every applicable day that's in the grid", () => {
    const blocks = computeOverlayBlocks(
      [filter({ days: ["M", "T", "W", "Th", "F"] })],
      baselineGrid,
    );
    expect(blocks).toHaveLength(5);
    expect(blocks.map((b) => b.day)).toEqual(["M", "T", "W", "Th", "F"]);
  });

  it("drops days the grid doesn't show (e.g. Sat/Sun filter vs M–F grid)", () => {
    const blocks = computeOverlayBlocks(
      [filter({ days: ["Sat", "Sun", "M"] })],
      baselineGrid,
    );
    // Only M lands; Sat/Sun not in dayBounds.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].day).toBe("M");
  });
});

describe("computeOverlayBlocks — degenerate grid state", () => {
  it("returns [] when axisHeight is zero", () => {
    const grid = { ...baselineGrid, axisBottomPx: 30 };
    expect(computeOverlayBlocks([filter({})], grid)).toEqual([]);
  });
  it("returns [] when timeSpan is zero", () => {
    const grid = { ...baselineGrid, maxTime: 8 * 60 };
    expect(computeOverlayBlocks([filter({})], grid)).toEqual([]);
  });
});

describe("computeOverlayBlocks — multiple overlapping filters", () => {
  it("emits one block per (filter × day); duplicates on same day are independent", () => {
    // Two filters, both on Mon, overlapping time ranges. Each gets its own
    // entry so the caller can composite translucencies.
    const blocks = computeOverlayBlocks(
      [
        filter({ id: 1, name: "gym", days: ["M"], start: 720, end: 840, pattern: "solid" }),
        filter({ id: 2, name: "lunch", days: ["M"], start: 780, end: 900, pattern: "dots" }),
      ],
      baselineGrid,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].filterId).toBe(1);
    expect(blocks[0].pattern).toBe("solid");
    expect(blocks[1].filterId).toBe(2);
    expect(blocks[1].pattern).toBe("dots");
  });
});

describe("personal filters on the linear calendar", () => {
  it("builds a timeline when there are filters but no staged classes", () => {
    expect(computeTimelineRange([], [filter({ start: 720, end: 780 })], "A71"))
      .toEqual({ startMin: 720, endMin: 1080 });
  });

  it("extends the course timeline to include early and late personal blocks", () => {
    const range = computeTimelineRange([{ start: 600, end: 660 }], [
      filter({ start: 390, end: 420 }),
      filter({ start: 1230, end: 1305 }),
    ], "A71");
    expect(range).toEqual({ startMin: 360, endMin: 1320 });
  });

  it("keeps an empty calendar when filters are hidden or in the other half", () => {
    expect(computeTimelineRange([], [
      filter({ visible: false }),
      filter({ session: "A72" }),
      filter({ days: ["Sat"] }),
    ], "A71")).toBeNull();
  });

  it("does not stretch one half for filters that only apply to the other", () => {
    expect(computeTimelineRange([{ start: 540, end: 600 }], [
      filter({ start: 1200, end: 1260, session: "A72" }),
    ], "A71")).toEqual({ startMin: 540, endMin: 900 });
  });

  it("preserves valid course times when imported filters have missing times", () => {
    expect(computeTimelineRange([{ start: 540, end: 600 }], [
      filter({ start: null }), filter({ end: NaN }), filter({ start: 800, end: 700 }),
    ], "A71")).toEqual({ startMin: 540, endMin: 900 });
  });

  it("positions lunch correctly across noon, without decoding 12-hour labels", () => {
    const blocks = computeColumnOverlayBlocks(
      [filter({ start: 720, end: 780, days: ["M"] })],
      { startMin: 540, endMin: 900, half: "A71" }, ["M", "T"], 1.1,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].top).toBeCloseTo(198);
    expect(blocks[0].height).toBeCloseTo(66);
    expect(blocks[0].left).toBe(0);
    expect(blocks[0].width).toBe(100);
  });

  it("positions evening blocks with numeric 24-hour coordinates", () => {
    const blocks = computeColumnOverlayBlocks(
      [filter({ start: 1230, end: 1290, days: ["Th"] })],
      { startMin: 1080, endMin: 1440, half: "A72" }, ["M", "Th"], 1.1,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].top).toBeCloseTo(165);
    expect(blocks[0].height).toBeCloseTo(66);
  });

  it("supports saved filters without explicit visibility or session defaults", () => {
    const f = filter({ start: 720, end: 780, visible: undefined, session: undefined });
    const range = computeTimelineRange([], [f], "A72");
    expect(range).not.toBeNull();
    expect(computeColumnOverlayBlocks([f], { ...range, half: "A72" }, ["M"], 1.1))
      .toHaveLength(1);
  });

  it("does not emit invalid rectangles for malformed imported filter times", () => {
    expect(computeOverlayBlocks([filter({ start: null }), filter({ end: NaN })], baselineGrid))
      .toEqual([]);
  });
});
