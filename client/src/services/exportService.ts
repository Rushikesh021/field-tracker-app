import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import type { Timestamp } from 'firebase/firestore';

export interface ExportableClient {
  id?: string;
  partyName: string;
  contactPerson?: string;
  contactNumber: string;
  gstNumber?: string;
  cityMarket?: string;
  fabricType?: string;
  weaveSpecs?: string;
  requirementType?: string;
  machineCount: number;
  monthlyCapacity: string;
  address: string;
  photos?: string[];
  status?: 'submitted' | 'verified' | 'rejected';
  submittedBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

function formatDateForExport(timestamp?: Timestamp | null): string {
  if (!timestamp) return 'N/A';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as number);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'Recent';
  }
}

/**
 * Format client rows for Texhub textile spreadsheet export.
 */
function prepareExportRows(clients: ExportableClient[]) {
  return clients.map((c, idx) => ({
    'Sr No': idx + 1,
    'Client / Mill Name': c.partyName || '',
    'Contact Person': c.contactPerson || '-',
    'Phone / WhatsApp': c.contactNumber || '',
    'GST / Tax ID': c.gstNumber || '-',
    'City / Market': c.cityMarket || '-',
    'Fabric Type': c.fabricType || 'Cotton Woven',
    'Weave / Quality Specs': c.weaveSpecs || '-',
    'Requirement Type': c.requirementType || 'Make to Order',
    'Looms / Machines': c.machineCount ?? 0,
    'Monthly Capacity': c.monthlyCapacity || '',
    'Mill / Office Address': c.address || '',
    'Swatches Attached': c.photos ? c.photos.length : 0,
    'Review Status': (c.status || 'submitted').toUpperCase(),
    'Field Agent': c.submittedBy || 'Agent',
    'Date Submitted': formatDateForExport(c.createdAt)
  }));
}

/**
 * Export clients to Excel (.xlsx) file with Texhub Innovations Enterprise Branding.
 */
export async function exportClientsToExcel(
  clients: ExportableClient[],
  filterName = 'All'
): Promise<void> {
  if (!clients || clients.length === 0) {
    alert(`No client records found under the "${filterName}" filter to export.`);
    return;
  }

  const rows = prepareExportRows(clients);
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  const colWidths = [
    { wch: 8 },  // Sr No
    { wch: 32 }, // Mill Name
    { wch: 22 }, // Contact Person
    { wch: 20 }, // Phone Number
    { wch: 18 }, // GST Number
    { wch: 20 }, // City / Market
    { wch: 22 }, // Fabric Type
    { wch: 30 }, // Weave Specs
    { wch: 22 }, // Requirement Type
    { wch: 16 }, // Looms
    { wch: 24 }, // Capacity
    { wch: 45 }, // Address
    { wch: 16 }, // Swatches
    { wch: 16 }, // Status
    { wch: 28 }, // Field Agent
    { wch: 22 }  // Date
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Texhub Orders - ${filterName}`);

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `Texhub_Innovations_${filterName}_${dateStr}.xlsx`;

  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      await Share.share({
        title: `TEXHUB INNOVATIONS - Client Intake & Field Orders Report (${filterName})`,
        text: `Exported ${clients.length} textile client order record(s) from Texhub Field Tracker.`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Texhub Excel Report'
      });
    } catch (err: unknown) {
      console.warn('Native share/save failed, attempting fallback download:', err);
      XLSX.writeFile(workbook, fileName);
    }
  } else {
    XLSX.writeFile(workbook, fileName);
  }
}

/**
 * Export clients to CSV (.csv) file with Texhub Innovations Header.
 */
export async function exportClientsToCSV(
  clients: ExportableClient[],
  filterName = 'All'
): Promise<void> {
  if (!clients || clients.length === 0) {
    alert(`No client records found under the "${filterName}" filter to export.`);
    return;
  }

  const rows = prepareExportRows(clients);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csvData = XLSX.utils.sheet_to_csv(worksheet);
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `Texhub_Innovations_${filterName}_${dateStr}.csv`;

  // Prepend UTF-8 BOM and Title header
  const titleHeader = `"TEXHUB INNOVATIONS - Client Intake & Field Orders Report (${filterName}) - Generated on ${new Date().toLocaleString()}"\n`;
  const bomCsv = '\uFEFF' + titleHeader + csvData;

  if (Capacitor.isNativePlatform()) {
    try {
      // Convert UTF-8 string to base64
      const base64Data = btoa(unescape(encodeURIComponent(bomCsv)));
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      await Share.share({
        title: `TEXHUB INNOVATIONS - Client Intake & Field Orders Report (${filterName})`,
        text: `Exported ${clients.length} textile client order record(s) from Texhub Field Tracker.`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Texhub CSV File'
      });
    } catch (err: unknown) {
      console.warn('Native CSV share failed, attempting fallback download:', err);
      downloadBlob(bomCsv, fileName, 'text/csv;charset=utf-8;');
    }
  } else {
    downloadBlob(bomCsv, fileName, 'text/csv;charset=utf-8;');
  }
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
