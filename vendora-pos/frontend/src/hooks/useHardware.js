import { useCallback } from 'react';
import * as hw from '../services/hardware';
import toast from 'react-hot-toast';
export function useHardware() {
  const openDrawer = useCallback(async () => { try { await hw.openDrawer(); } catch (e) { toast.error('Failed to open drawer'); } }, []);
  const testPrint = useCallback(async () => { try { await hw.testPrint(); toast.success('Test print sent'); } catch { toast.error('Printer error'); } }, []);
  return { openDrawer, testPrint };
}
