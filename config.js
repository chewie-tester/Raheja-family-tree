// Edit only this file to point the app at a different sheet.
// The sheet must be shared as "Anyone with the link can view" for the live load to work.
// The app only ever READS from it; nothing is written back.
const CONFIG = {
  sheetId: "1WwgCoLvI7_CTG4SLa8u6CvSmT0khtD1vJfhqa7C4EWw",
  peopleTab: "People",
  unionsTab: "Unions",
};
CONFIG.csvUrl = (tab) =>
  `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
