import * as XLSX from 'xlsx';
import path from 'path';

const filePath = path.join(__dirname, '../../doctor.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
if (data.length > 0) {
    console.log('Headers:', JSON.stringify(data[0]));
    console.log('Sample Row:', JSON.stringify(data[1]));
}
