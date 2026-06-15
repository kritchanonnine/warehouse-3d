const TOKEN = "";
const BASE_ID = "appRarHKTSdp3giFz";
const TABLE_NAME = "Serial Number List";

export async function findBySerial(serial) {

  try {

    const formula = `{เลข Serial No.}='${serial}'`;

    const url =
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=${encodeURIComponent(formula)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    });

    console.log("Status:", response.status);

    const data = await response.json();

    console.log("Airtable Response:");
    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(data.error?.message || "Airtable Error");
    }

    if (!data.records || data.records.length === 0) {
      return null;
    }

    return data.records[0].fields;

  } catch (error) {

    console.error("Airtable Error:", error);

    return null;
  }
}