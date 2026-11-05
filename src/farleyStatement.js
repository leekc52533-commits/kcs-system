import {formatDateDisplay} from '../shared/datePresentation.js'
// Dedicated FARLEY appendix. Only exact normalized branch names are combined.
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()
const accounts = [
 ['F.Mall', '3225689676'],
 ['F.Bakery', '8881048659504'],
 ['F.Cafe', '888104866142'],
 ['F.H/M', '3230505603'],
 ['F.App', '32320505506'],
 ['F.In/Ch', '3230505700'],
 ['F.Shoe', '3229935101'],
]

// Allocate whole cents, distributing rounding remainders deterministically.
export function splitCents(total, weights) {
 const sign = total < 0 ? -1 : 1
 const exact = weights.map(weight => Math.abs(total) * weight / 100)
 const cents = exact.map(Math.floor)
 let remaining = Math.abs(total) - cents.reduce((a, b) => a + b, 0)
 const order = exact.map((value, index) => ({index, fraction: value - cents[index]}))
  .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
 for (const {index} of order) {
  if (remaining-- <= 0) break
  cents[index]++
 }
 return cents.map(value => value * sign)
}

export function appendFarleyStatement(sheet, bills, {from, to}, bold) {
 if (normalize(bills[0]?.customerName) !== 'FARLEY') return
 const days = new Map()
 const totals = [{qty: 0, cents: 0, prices: new Set()}, {qty: 0, cents: 0, prices: new Set()}]
 for (const bill of bills) {
  const branch = normalize(bill.branchName)
  const column = branch === 'FARLEY SAMARAHAN' ? 0
   : ['FARLEY MALL', 'FARLEY MALL GF'].includes(branch) ? 1 : -1
  if (column < 0) continue
  if (!days.has(bill.serviceDate)) days.set(bill.serviceDate, [null, null])
  const day = days.get(bill.serviceDate)
  for (const item of bill.items) {
   day[column] = (day[column] ?? 0) + item.quantity
   totals[column].qty += item.quantity
   totals[column].cents += item.itemTotalCents
   totals[column].prices.add(item.unitPrice)
  }
 }
 sheet.addRow([])
 const title = sheet.addRow(['Farley'])
 sheet.mergeCells(title.number, 1, title.number, 3)
 bold.add(title.number)
 const period = sheet.addRow([from.slice(0, 7) === to.slice(0, 7)
  ? new Date(from + 'T00:00:00Z').toLocaleDateString('en-GB', {month: 'short', year: 'numeric', timeZone: 'UTC'})
  : formatDateDisplay(from) + ' – ' + formatDateDisplay(to)])
 sheet.mergeCells(period.number, 1, period.number, 3)
 bold.add(period.number)
 bold.add(sheet.addRow(['Date', 'Samarahan', 'F.Mall']).number)
 for (let date = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z'); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
  const key = date.toISOString().slice(0, 10)
  const row = sheet.addRow([new Date(date), ...(days.get(key) || [null, null])])
  row.getCell(1).numFmt = 'dd-mmm-yy'
  row.getCell(2).numFmt = row.getCell(3).numFmt = '#,##0'
 }
 const qty = sheet.addRow(['Total Qty', ...totals.map(total => total.qty)])
 bold.add(qty.number)
 qty.getCell(2).numFmt = qty.getCell(3).numFmt = '#,##0'
 sheet.addRow(['Per/Kg', ...totals.map(total => [...total.prices].sort((a,b)=>a-b)
  .map(price => Number(price).toLocaleString('en-US', {useGrouping:false, minimumFractionDigits:2, maximumFractionDigits:3})).join('/'))])
 const amount = sheet.addRow(['Amount (RM)', ...totals.map(total => total.cents / 100)])
 bold.add(amount.number)
 amount.getCell(2).numFmt = amount.getCell(3).numFmt = '#,##0.00'
 const [seventy, thirty] = splitCents(totals[1].cents, [70, 30])
 for (const [label, cents] of [['F.Mall 70%', seventy], ['F.Mall 30%', thirty]]) {
  sheet.addRow([label, null, cents / 100]).getCell(3).numFmt = '#,##0.00'
 }
 sheet.addRow([])
 bold.add(sheet.addRow(['Allocation', 'Account No.', 'Amount (RM)', 'Share']).number)
 const allocations = [...splitCents(seventy, [90, 5, 5]), ...splitCents(thirty, [70, 10, 10, 10])]
 const shares = ['70% × 90%', '70% × 5%', '70% × 5%', '30% × 70%', '30% × 10%', '30% × 10%', '30% × 10%']
 accounts.forEach(([label, account], index) => {
  const row = sheet.addRow([label, account, allocations[index] / 100, shares[index]])
  row.getCell(2).numFmt = '@'
  row.getCell(3).numFmt = '#,##0.00'
 })
 const total = sheet.addRow(['Allocation Total', null, allocations.reduce((a,b)=>a+b,0) / 100])
 bold.add(total.number)
 total.getCell(3).numFmt = '#,##0.00'
}
