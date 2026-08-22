import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import type { Timestamp } from 'firebase/firestore';

export interface ExportableClient {
  id?: string;
  partyName: string;
  contactNumber: string;
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
 * Format client rows for spreadsheet export.
 */
function prepareExportRows(clients: ExportableClient[]) {
  return clients.map((c, idx) => ({
    'Sr No': idx + 1,
    'Party Name': c.partyName || '',
    'Contact Number': c.contactNumber || '',
    'Machine Count': c.machineCount ?? 0,
    'Monthly Capacity': c.monthlyCapacity || '',
    'Factory / Office Address': c.address || '',
    'Photos Count': c.photos ? c.photos.length : 0,
    'Status': (c.status || 'submitted').toUpperCase(),
    'Submitted By': c.submittedBy || 'Agent',
    'Submission Date': formatDateForExport(c.createdAt)
  }));
}

/**
 * Export clients to Excel (.xlsx) file.
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
    { wch: 30 }, // Party Name
    { wch: 18 }, // Contact Number
    { wch: 15 }, // Machine Count
    { wch: 25 }, // Monthly Capacity
    { wch: 45 }, // Address
    { wch: 14 }, // Photos Count
    { wch: 14 }, // Status
    { wch: 30 }, // Submitted By
    { wch: 22 }  // Submission Date
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Clients - ${filterName}`);

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `FieldTracker_${filterName}_${dateStr}.xlsx`;

  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      await Share.share({
        title: `Field Tracker Export (${filterName})`,
        text: `Exported ${clients.length} client record(s) from Field Tracker.`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share Excel Spreadsheet'
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
 * Export clients to CSV (.csv) file.
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
  const fileName = `FieldTracker_${filterName}_${dateStr}.csv`;

  // Prepend UTF-8 BOM for proper Excel encoding
  const bomCsv = '\uFEFF' + csvData;

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
        title: `Field Tracker CSV Export (${filterName})`,
        text: `Exported ${clients.length} client record(s) from Field Tracker.`,
        url: savedFile.uri,
        dialogTitle: 'Save or Share CSV File'
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
