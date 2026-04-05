import { useState, useCallback } from 'react';
import { getByBarcode, getProducts } from '../services/products';

export function useProducts() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lookupBarcode = useCallback(async (barcode) => {
    setLoading(true); setError(null);
    try { return await getByBarcode(barcode); }
    catch (err) { setError(err); throw err; }
    finally { setLoading(false); }
  }, []);

  const searchProducts = useCallback(async (params) => {
    setLoading(true); setError(null);
    try { return await getProducts(params); }
    catch (err) { setError(err); throw err; }
    finally { setLoading(false); }
  }, []);

  return { lookupBarcode, searchProducts, loading, error };
}
