// No spreadsheet is built into the app. The person using it always chooses a file:
// either a local Excel (.xlsx) file or a link to a Google Sheet they can share as
// "Anyone with the link can view". The app only ever READS from it; nothing is written back.
const CONFIG = {
  peopleTab: "People",
  unionsTab: "Unions",
};
// Builds the CSV export address for one tab of the sheet with the given ID.
CONFIG.csvUrl = (sheetId, tab) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
