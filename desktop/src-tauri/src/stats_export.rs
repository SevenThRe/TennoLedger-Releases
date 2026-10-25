use crate::domain::Dataset;
use serde_json::{Map, Value};
use std::collections::BTreeSet;

// A UTF-8 BOM makes Chinese text readable when the CSV is opened in Excel.
// Quote every cell; guard textual spreadsheet expressions independently of CSV
// escaping. Numeric JSON values retain their numeric representation.
fn cell(value: &Value) -> String {
    let text = match value {
        Value::Null => String::new(),
        Value::String(text) => {
            let trimmed = text.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
            if text.starts_with(['\t', '\r', '\n']) || trimmed.starts_with(['=', '+', '-', '@']) {
                format!("'{text}")
            } else { text.clone() }
        }
        other => other.to_string(),
    };
    format!("\"{}\"", text.replace('"', "\"\""))
}

fn encode(rows: &[Map<String, Value>], preferred: &[&str]) -> String {
    let mut columns: Vec<String> = preferred.iter().map(|key| (*key).into()).collect();
    let extras: BTreeSet<_> = rows.iter().flat_map(|row| row.keys())
        .filter(|key| !preferred.contains(&key.as_str())).cloned().collect();
    columns.extend(extras);
    let mut output = String::from("\u{feff}");
    output.push_str(&columns.iter().map(|key| cell(&Value::String(key.clone()))).collect::<Vec<_>>().join(","));
    output.push_str("\r\n");
    for row in rows {
        output.push_str(&columns.iter().map(|key| cell(row.get(key).unwrap_or(&Value::Null))).collect::<Vec<_>>().join(","));
        output.push_str("\r\n");
    }
    output
}

pub fn stats(data: &Dataset) -> String {
    let rows: Vec<Map<String, Value>> = data.general_data_points.iter()
        .map(|row| row.iter().map(|(key, value)| (key.clone(), value.clone())).collect()).collect();
    encode(&rows, &["ts", "plat", "ducats", "endo", "credits", "aya", "vitus", "relicOpened", "trades", "mr", "percentageCompletion"])
}

pub fn trades(data: &Dataset) -> Result<String, String> {
    let mut rows = Vec::with_capacity(data.trades.len() + data.exchanges.len());
    for (record_type, values) in [
        ("trade", serde_json::to_value(&data.trades)),
        ("exchange", serde_json::to_value(&data.exchanges)),
    ] {
        let values = values.map_err(|_| "交易 CSV 转换失败")?;
        for value in values.as_array().ok_or("交易 CSV 记录格式无效")? {
            let mut row = value.as_object().ok_or("交易 CSV 记录格式无效")?.clone();
            row.insert("recordType".into(), record_type.into());
            rows.push(row);
        }
    }
    // Nested exchange sides are JSON arrays in separate CSV cells. Do not
    // flatten into one item or invent a per-item price for a bundle/barter.
    rows.sort_by(|a, b| a.get("ts").and_then(Value::as_str).cmp(&b.get("ts").and_then(Value::as_str))
        .then_with(|| a.get("id").and_then(Value::as_str).cmp(&b.get("id").and_then(Value::as_str))));
    Ok(encode(&rows, &["recordType", "id", "ts", "partner", "side", "kind", "itemId", "name", "quantity", "platinum", "category", "sent", "received", "referenceItem"]))
}

#[cfg(test)]
mod tests {
    use super::*;
    // Independent small CSV reader for assertions: quoted commas, quotes and
    // embedded CR/LF must survive, rather than matching the writer's raw text.
    fn read(input: &str) -> Vec<Vec<String>> {
        let mut rows=Vec::new();let mut row=Vec::new();let mut field=String::new();let mut quoted=false;
        let mut chars=input.trim_start_matches('\u{feff}').chars().peekable();
        while let Some(ch)=chars.next() {
            match ch {
                '"' if quoted && chars.peek()==Some(&'"') => {field.push('"');chars.next();},
                '"' => quoted=!quoted,
                ',' if !quoted => row.push(std::mem::take(&mut field)),
                '\r' if !quoted && chars.peek()==Some(&'\n') => {chars.next();row.push(std::mem::take(&mut field));rows.push(std::mem::take(&mut row));},
                other => field.push(other),
            }
        }
        assert!(!quoted);assert!(row.is_empty()&&field.is_empty());rows
    }
    #[test]
    fn stats_csv_preserves_unicode_null_zero_time_and_additional_fields() {
        let data=crate::domain::parse(r#"{"generalDataPoints":[{"ts":"2026-10-24T08:00:00+08:00","vitus":0,"plat":null},{"ts":"2026-10-24T00:01:00Z","vitus":12,"relicOpened":3}]}"#).unwrap();
        let mut data=data;data.general_data_points[0].insert("futureRank".into(),5.into());
        let csv=stats(&data);assert!(csv.as_bytes().starts_with(&[0xef,0xbb,0xbf]));assert!(csv.ends_with("\r\n"));
        let rows=read(&csv);let field=|name:&str|rows[0].iter().position(|s|s==name).unwrap();
        assert_eq!(rows.len(),3);assert_eq!(rows[1][field("ts")],"2026-10-24T00:00:00.000Z");
        assert_eq!(rows[1][field("vitus")],"0");assert_eq!(rows[1][field("plat")],"");assert_eq!(rows[1][field("futureRank")],"5");
        assert_eq!(rows[2][field("relicOpened")],"3");
    }
    #[test]
    fn csv_escapes_text_and_neutralizes_spreadsheet_formulas() {
        let texts=["中文,\"引号\"\r\n第二行","=1+1"," +SUM(A1)","-2+3","@formula","\t=1","\n=1","\u{feff}=1"];
        let rows=texts.iter().map(|text|Map::from_iter([("text".into(),Value::String((*text).into()))])).collect::<Vec<_>>();
        let csv=encode(&rows,&["text"]);let parsed=read(&csv);
        assert_eq!(parsed[1][0],texts[0]);
        for (index,text) in texts.iter().enumerate().skip(1){assert_eq!(parsed[index+1][0],format!("'{text}"));}
        assert_eq!(cell(&Value::from(-3)),"\"-3\"");
    }
    #[test]
    fn trade_csv_retains_legacy_records_and_both_multi_item_exchange_sides() {
        let data=crate::domain::parse(r#"{"trades":[{"id":"one","ts":"2026-10-24T00:00:00Z","itemId":"part","name":"零件,\"A\"","side":"sale","quantity":2,"platinum":30,"partner":"=danger","category":"prime"}],"exchanges":[{"id":"two","ts":"2026-10-24T01:00:00Z","partner":"交易者","kind":"exchange","sent":[{"itemId":"a","quantity":2},{"itemId":"b","quantity":3}],"received":[{"itemId":"c","quantity":4},{"itemId":"/AF_Special/Platinum","quantity":5}]}]}"#).unwrap();
        let rows=read(&trades(&data).unwrap());let field=|name:&str|rows[0].iter().position(|s|s==name).unwrap();
        assert_eq!(rows.len(),3);assert_eq!(rows[1][field("name")],"零件,\"A\"");assert_eq!(rows[1][field("partner")],"'=danger");
        assert_eq!(rows[1][field("quantity")],"2");assert_eq!(rows[1][field("platinum")],"30");
        assert_eq!(rows[2][field("recordType")],"exchange");assert_eq!(rows[2][field("platinum")],"");
        assert_eq!(serde_json::from_str::<Value>(&rows[2][field("sent")]).unwrap(),serde_json::to_value(&data.exchanges[0].sent).unwrap());
        assert_eq!(serde_json::from_str::<Value>(&rows[2][field("received")]).unwrap(),serde_json::to_value(&data.exchanges[0].received).unwrap());
    }
    #[test]
    fn exchange_csv_preserves_reference_slot_and_empty_exports_have_headers() {
        let data=crate::domain::parse(r#"{"exchanges":[{"id":"x","ts":"2026-10-24T00:00:00Z","partner":"p","kind":"sale","sent":[{"itemId":"a","quantity":2},{"itemId":"b","quantity":1}],"received":[{"itemId":"/AF_Special/Platinum","quantity":75}],"referenceItem":{"itemId":"a","quantity":2}}]}"#).unwrap();
        let rows=read(&trades(&data).unwrap());let col=rows[0].iter().position(|s|s=="referenceItem").unwrap();
        assert_eq!(serde_json::from_str::<Value>(&rows[1][col]).unwrap(),serde_json::json!({"itemId":"a","quantity":2}));
        assert_eq!(read(&stats(&Dataset::default())).len(),1);assert_eq!(read(&trades(&Dataset::default()).unwrap()).len(),1);
    }
}
