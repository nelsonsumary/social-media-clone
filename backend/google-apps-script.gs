/**
 * Google Apps Script — Free email sending service for SocialClone
 *
 * DEPLOYMENT:
 *   1. Go to https://script.google.com and create a new project
 *   2. Paste this code
 *   3. Click Deploy > New deployment > Web app
 *   4. Execute as: Me, Who has access: Anyone
 *   5. Copy the web app URL and set it as EMAIL_SERVICE_URL in backend/.env
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { to, subject, body } = data;

    if (!to || !subject || !body) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: "Missing required fields: to, subject, body" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    GmailApp.sendEmail(to, subject, body);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "SocialClone email service is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}
