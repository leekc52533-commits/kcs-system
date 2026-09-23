// Money totals remain cents; material weight and unit price have separate precision.
export const formatWeight=value=>Number(value).toFixed(2)
export const formatUnitPrice=value=>Number(value).toFixed(3)
export const validWeight=value=>/^\d{1,7}(?:\.\d{1,2})?$/.test(String(value).trim())&&Number(value)>0
export const validUnitPrice=value=>/^\d{1,5}(?:\.\d{1,3})?$/.test(String(value).trim())&&Number(value)>0
