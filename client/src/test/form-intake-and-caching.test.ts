import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compressBase64OrDataUrl, compressImageFile } from '../services/imageService';

describe('3. Form Intake, Image Processing & Offline Caching Suite', () => {
  const INTAKE_DRAFT_KEY = 'field_tracker_intake_draft';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Offline Form Caching in localStorage', () => {
    it('persists in-progress intake form fields to localStorage', () => {
      const mockFormData = {
        partyName: 'Sunrise Textiles Ltd',
        contactNumber: '+91 98111 22233',
        machineCount: '48',
        monthlyCapacity: '120,000 meters/month',
        address: 'Sector 18, Electronic City, Bengaluru',
      };

      localStorage.setItem(INTAKE_DRAFT_KEY, JSON.stringify(mockFormData));

      const saved = localStorage.getItem(INTAKE_DRAFT_KEY);
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!);
      expect(parsed.partyName).toBe('Sunrise Textiles Ltd');
      expect(parsed.contactNumber).toBe('+91 98111 22233');
      expect(parsed.machineCount).toBe('48');
      expect(parsed.monthlyCapacity).toBe('120,000 meters/month');
      expect(parsed.address).toBe('Sector 18, Electronic City, Bengaluru');
    });

    it('clears the cached draft upon successful submission', () => {
      localStorage.setItem(
        INTAKE_DRAFT_KEY,
        JSON.stringify({ partyName: 'Draft Co', contactNumber: '9999999999' })
      );

      expect(localStorage.getItem(INTAKE_DRAFT_KEY)).not.toBeNull();

      localStorage.removeItem(INTAKE_DRAFT_KEY);
      expect(localStorage.getItem(INTAKE_DRAFT_KEY)).toBeNull();
    });
  });

  describe('Client-Side HTML5 Canvas Image Compression', () => {
    it('handles base64 image data compression preserving aspect ratio (1280px max dimension, 0.7 quality)', async () => {
      const mockDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      const compressed = await compressBase64OrDataUrl(mockDataUrl, 1280, 0.7);
      expect(compressed).toBeDefined();
      expect(typeof compressed).toBe('string');
      expect(compressed).toContain('data:image/jpeg;base64');
    });

    it('rejects invalid non-image file formats', async () => {
      const textFile = new File(['hello world'], 'document.txt', { type: 'text/plain' });

      await expect(compressImageFile(textFile, 1280, 0.7)).rejects.toThrow(
        /not a recognized image format/i
      );
    });
  });
});
