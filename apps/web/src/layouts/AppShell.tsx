import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Select } from '../components/ui';

const NAV: { section: string; items: { to: string; label: string; perm?: string }[] }[] = [
  { section: 'Overview', items: [{ to: '/', label: 'Home' }, { to: '/contacts', label: 'Contacts', perm: 'contacts.view' }] },
  { section: 'Jewellery', items: [{ to: '/jewellery/designs', label: 'Designs' }, { to: '/jewellery/products', label: 'Jewellery Products' }] },
  { section: 'Accounting', items: [{ to: '/accounting', label: 'Dashboard' }, { to: '/accounting/chart-of-accounts', label: 'Chart of Accounts', perm: 'accounts.view' }, { to: '/accounting/products', label: 'Products', perm: 'products.view' },
    { to: '/accounting/inventory/stock-view', label: 'Stock View', perm: 'products.view' }, { to: '/accounting/inventory/branch-stock', label: 'Branch Wise Stock', perm: 'products.view' },
    { to: '/accounting/inventory/adjustment', label: 'Stock Adjustment', perm: 'stock_adjustment.view' }, { to: '/accounting/inventory/transfer', label: 'Stock Transfer F/B', perm: 'stock_transfer.view' },
    { to: '/accounting/inventory/item-transfer', label: 'Product Transfer', perm: 'product_transfer.view' },
    { to: '/accounting/purchase/orders', label: 'Purchase Orders', perm: 'purchase_order.view' }, { to: '/accounting/purchase/order-returns', label: 'Purchase Order Returns', perm: 'purchase_order_return.view' },
    { to: '/accounting/purchase/bills', label: 'Purchase Bills', perm: 'purchase_bill.view' }, { to: '/accounting/purchase/debit-notes', label: 'Debit Notes', perm: 'debit_note.view' },
    { to: '/accounting/purchase/vendor-payments', label: 'Vendor Payments', perm: 'vendor_payment.view' },
    { to: '/accounting/sales/estimates', label: 'Estimates', perm: 'estimate.view' }, { to: '/accounting/sales/orders', label: 'Sales Orders', perm: 'sales_order.view' },
    { to: '/accounting/sales/invoices', label: 'Invoices', perm: 'invoice.view' }, { to: '/accounting/sales/credit-notes', label: 'Credit Notes', perm: 'credit_note.view' },
    { to: '/accounting/sales/customer-payments', label: 'Customer Payments', perm: 'customer_payment.view' }] },
  {
    section: 'Settings',
    items: [
      { to: '/settings/firms', label: 'Firms', perm: 'firms.view' },
      { to: '/settings/branches', label: 'Branches', perm: 'branches.view' },
      { to: '/settings/users', label: 'Users', perm: 'users.view' },
      { to: '/settings/roles', label: 'Roles', perm: 'roles.view' },
      { to: '/settings/masters', label: 'Masters' },
      { to: '/settings/series', label: 'Document Series', perm: 'document_series.view' },
      { to: '/settings/custom-fields', label: 'Custom Fields', perm: 'custom_fields.view' },
    ],
  },
];

export function AppShell() {
  const { user, firms, firm, setFirm, logout, can } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-white border-r border-line flex flex-col">
        <div className="h-16 flex items-center px-5 font-semibold text-brand text-lg">Diamond ERP</div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {NAV.map((g) => (
            <div key={g.section} className="mt-4">
              <div className="px-2 mb-1 text-[11px] font-semibold tracking-wider text-ink-faint uppercase">{g.section}</div>
              {g.items.filter((i) => !i.perm || can(i.perm)).map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/'}
                  className={({ isActive }) => `block px-2 py-2 rounded-md ${isActive ? 'bg-brand-soft text-brand font-medium' : 'text-ink hover:bg-canvas'}`}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-line flex items-center justify-end gap-4 px-6">
          <Select className="w-56 h-9" value={firm?.id ?? ''} onChange={(e) => setFirm(e.target.value)} aria-label="Firm">
            {firms.map((f) => <option key={f.id} value={f.id}>{f.name}{f.isDefault ? ' (Default)' : ''}</option>)}
          </Select>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand text-white grid place-items-center font-semibold">{user?.name.charAt(0)}</div>
            <div className="leading-tight"><div className="font-medium">{user?.name}</div><div className="text-xs text-ink-muted">{user?.roles.join(', ')}</div></div>
            <button className="text-ink-muted hover:text-ink ml-2" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
          </div>
        </header>
        <main className="flex-1 p-6"><Outlet /></main>
      </div>
    </div>
  );
}
