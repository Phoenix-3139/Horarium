// Placeholder user-plan data. Minimal shell — one empty plan, no committed
// sections, no cores, no conflicts, no analysis. Exists only so the legacy
// plan-rendering code (buildTabs / buildOptionDetail / buildScheduleTable /
// exports) has valid iteration targets without hardcoded personal data.
//
// This entire file disappears when the plan-state extraction phase lifts
// user plans into the store (user.json / data/user.json per DATA_SCHEMA).
// Until then: same shape as the legacy SCHED_DATA blob, just empty.
//
// Loaded as a CLASSIC (non-module) script BEFORE the main classic script so
// that `SCHED_DATA` is a global by the time the main script's top-level
// calls run.

window.SCHED_DATA = {
  options: [
    {
      name: "Plan A",
      tagline: "No sections committed yet",
      desc: "Paste subject data in the Catalog tab to populate the picker, then add sections to build a plan.",
      sections: []
    }
  ],
  sections: {},
  cores: [],
  conflicts: { "0": {} },
  analysis: [
    { "A71": [], "A72": [] }
  ]
};
