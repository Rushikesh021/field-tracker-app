import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageLightboxModal } from '../components/ImageLightboxModal';
import { exportClientsToExcel, exportClientsToCSV, type ExportableClient } from '../services/exportService';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Mock Capacitor Core
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(true),
  },
}));

// Mock Filesystem & Share
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: 'file:///cache/export.xlsx' }),
  },
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn().mockResolvedValue({ value: true }),
  },
}));

describe('4. Admin Dashboard, Image Lightbox & Excel Export Suite', () => {
  const mockClients: ExportableClient[] = [
    {
      id: 'client-1',
      partyName: 'Apex Garments Pvt Ltd',
      contactNumber: '+91 98765 43210',
      machineCount: 24,
      monthlyCapacity: '50,000 meters/month',
      address: 'Plot 45, GIDC Industrial Area',
      photos: ['data:image/jpeg;base64,photo1', 'data:image/jpeg;base64,photo2'],
      status: 'submitted',
      submittedBy: 'Field Agent 01',
    },
    {
      id: 'client-2',
      partyName: 'Bharat Weaving Mills',
      contactNumber: '+91 91234 56789',
      machineCount: 40,
      monthlyCapacity: '100,000 meters/month',
      address: 'Survey 102, Surat Textile Park',
      photos: ['data:image/jpeg;base64,photo3'],
      status: 'verified',
      submittedBy: 'Field Agent 02',
    },
    {
      id: 'client-3',
      partyName: 'Delta Synthetic Fab',
      contactNumber: '+91 99887 76655',
      machineCount: 10,
      monthlyCapacity: '20,000 meters/month',
      address: 'Industrial Zone 3, Ahmedabad',
      photos: [],
      status: 'rejected',
      submittedBy: 'Field Agent 01',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Interactive Image Lightbox Modal', () => {
    it('renders image lightbox modal with zoom, pan, and rotation toolbar', () => {
      const onClose = vi.fn();
      const photos = [
        'data:image/jpeg;base64,mockPhoto1',
        'data:image/jpeg;base64,mockPhoto2',
      ];

      render(
        <ImageLightboxModal
          isOpen={true}
          photos={photos}
          initialIndex={0}
          title="Apex Garments Site Photo"
          onClose={onClose}
        />
      );

      // Check title and photo index
      expect(screen.getByText('Apex Garments Site Photo')).toBeInTheDocument();
      expect(screen.getByText(/Photo 1 of 2/i)).toBeInTheDocument();

      // Check zoom buttons and controls
      expect(screen.getByTitle(/Zoom In/i)).toBeInTheDocument();
      expect(screen.getByTitle(/Zoom Out/i)).toBeInTheDocument();
      expect(screen.getByTitle(/Rotate 90°/i)).toBeInTheDocument();
      expect(screen.getByTitle(/Reset Fit/i)).toBeInTheDocument();

      // Click Zoom In
      const zoomInBtn = screen.getByTitle(/Zoom In/i);
      fireEvent.click(zoomInBtn);
      expect(screen.getByText('150%')).toBeInTheDocument();

      // Click Close
      const closeBtn = screen.getByTitle(/Close/i);
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('closes lightbox on Escape key event', () => {
      const onClose = vi.fn();
      render(
        <ImageLightboxModal
          isOpen={true}
          photos={['data:image/jpeg;base64,mockPhoto1']}
          initialIndex={0}
          title="Photo"
          onClose={onClose}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Excel (.xlsx) and CSV (.csv) Data Export Engine', () => {
    it('generates a valid XLSX spreadsheet and triggers native file share', async () => {
      await exportClientsToExcel(mockClients, 'Verified');

      expect(Filesystem.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringMatching(/FieldTracker_Verified_\d{4}-\d{2}-\d{2}\.xlsx/),
          directory: 'CACHE',
        })
      );

      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Field Tracker Export (Verified)'),
          url: 'file:///cache/export.xlsx',
        })
      );
    });

    it('generates a valid CSV file with UTF-8 BOM encoding and triggers native share', async () => {
      await exportClientsToCSV(mockClients, 'All');

      expect(Filesystem.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringMatching(/FieldTracker_All_\d{4}-\d{2}-\d{2}\.csv/),
          directory: 'CACHE',
        })
      );

      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Field Tracker CSV Export (All)'),
          url: 'file:///cache/export.xlsx',
        })
      );
    });

    it('gracefully alerts when dataset is empty without throwing errors', async () => {
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

      await exportClientsToExcel([], 'Verified');
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('No client records found'));

      await exportClientsToCSV([], 'Rejected');
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('No client records found'));

      alertMock.mockRestore();
    });
  });
});
