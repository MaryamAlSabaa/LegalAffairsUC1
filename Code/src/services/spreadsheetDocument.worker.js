import { parseSpreadsheetDocument, spreadsheetPreviewErrorMessage } from "./spreadsheetDocument.js";

self.onmessage = async (event) => {
  try {
    self.postMessage({ workbook: await parseSpreadsheetDocument(event.data) });
  } catch (error) {
    self.postMessage({ error: spreadsheetPreviewErrorMessage(error) });
  }
};
