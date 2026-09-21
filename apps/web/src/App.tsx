import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './layouts/AppShell';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { BranchesPage, FirmsPage } from './pages/settings/Org';
import { RolesPage, UsersPage } from './pages/settings/Users';
import { MastersPage } from './pages/settings/Masters';
import { SeriesPage } from './pages/settings/Series';
import { CustomFieldsPage } from './pages/settings/CustomFields';
import { ContactsListPage } from './pages/contacts/ContactsList';
import { ContactFormPage } from './pages/contacts/ContactForm';
import { ChartOfAccountsPage } from './pages/accounting/ChartOfAccounts';
import { ProductFormPage, ProductsListPage } from './pages/accounting/Products';
import { StockAdjustmentFormPage, StockAdjustmentsPage } from './pages/inventory/StockAdjustment';
import { ProductTransferFormPage, ProductTransfersPage, StockTransferFormPage, StockTransfersPage } from './pages/inventory/Transfers';
import { BranchStockPage, StockViewPage } from './pages/inventory/StockView';
import * as P from './pages/purchase';
import * as S from './pages/sales';
import { CustomerPaymentFormPage, CustomerPaymentsPage, VendorPaymentFormPage, VendorPaymentsPage } from './pages/purchase/Payments';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-ink-muted">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

const Soon = ({ name }: { name: string }) => <div className="card p-10 text-center text-ink-muted">{name} — coming next</div>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><AppShell /></Protected>}>
        <Route index element={<HomePage />} />
        <Route path="contacts" element={<ContactsListPage />} />
        <Route path="contacts/:id" element={<ContactFormPage />} />
        <Route path="jewellery/*" element={<Soon name="Jewellery" />} />
        <Route path="accounting" element={<Soon name="Dashboard" />} />
        <Route path="accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
        <Route path="accounting/products" element={<ProductsListPage />} />
        <Route path="accounting/products/:id" element={<ProductFormPage />} />
        <Route path="accounting/inventory/stock-view" element={<StockViewPage />} />
        <Route path="accounting/inventory/branch-stock" element={<BranchStockPage />} />
        <Route path="accounting/inventory/adjustment" element={<StockAdjustmentsPage />} />
        <Route path="accounting/inventory/adjustment/:id" element={<StockAdjustmentFormPage />} />
        <Route path="accounting/inventory/transfer" element={<StockTransfersPage />} />
        <Route path="accounting/inventory/transfer/:id" element={<StockTransferFormPage />} />
        <Route path="accounting/inventory/item-transfer" element={<ProductTransfersPage />} />
        <Route path="accounting/inventory/item-transfer/:id" element={<ProductTransferFormPage />} />
        <Route path="accounting/purchase/orders" element={<P.PurchaseOrdersPage />} /><Route path="accounting/purchase/orders/new" element={<P.PurchaseOrderForm />} /><Route path="accounting/purchase/orders/:id" element={<P.PurchaseOrderDetail />} />
        <Route path="accounting/purchase/order-returns" element={<P.PurchaseOrderReturnsPage />} /><Route path="accounting/purchase/order-returns/new" element={<P.PurchaseOrderReturnForm />} /><Route path="accounting/purchase/order-returns/:id" element={<P.PurchaseOrderReturnDetail />} />
        <Route path="accounting/purchase/bills" element={<P.PurchaseBillsPage />} /><Route path="accounting/purchase/bills/new" element={<P.PurchaseBillForm />} /><Route path="accounting/purchase/bills/:id" element={<P.PurchaseBillDetail />} />
        <Route path="accounting/purchase/debit-notes" element={<P.DebitNotesPage />} /><Route path="accounting/purchase/debit-notes/new" element={<P.DebitNoteForm />} /><Route path="accounting/purchase/debit-notes/:id" element={<P.DebitNoteDetail />} />
        <Route path="accounting/purchase/vendor-payments" element={<VendorPaymentsPage />} /><Route path="accounting/purchase/vendor-payments/:id" element={<VendorPaymentFormPage />} />
        <Route path="accounting/sales/estimates" element={<S.EstimatesPage />} /><Route path="accounting/sales/estimates/new" element={<S.EstimateForm />} /><Route path="accounting/sales/estimates/:id" element={<S.EstimateDetail />} />
        <Route path="accounting/sales/orders" element={<S.SalesOrdersPage />} /><Route path="accounting/sales/orders/new" element={<S.SalesOrderForm />} /><Route path="accounting/sales/orders/:id" element={<S.SalesOrderDetail />} />
        <Route path="accounting/sales/invoices" element={<S.InvoicesPage />} /><Route path="accounting/sales/invoices/new" element={<S.InvoiceForm />} /><Route path="accounting/sales/invoices/:id" element={<S.InvoiceDetail />} />
        <Route path="accounting/sales/credit-notes" element={<S.CreditNotesPage />} /><Route path="accounting/sales/credit-notes/new" element={<S.CreditNoteForm />} /><Route path="accounting/sales/credit-notes/:id" element={<S.CreditNoteDetail />} />
        <Route path="accounting/sales/customer-payments" element={<CustomerPaymentsPage />} /><Route path="accounting/sales/customer-payments/:id" element={<CustomerPaymentFormPage />} />
        <Route path="accounting/*" element={<Soon name="Accounting" />} />
        <Route path="settings/firms" element={<FirmsPage />} />
        <Route path="settings/branches" element={<BranchesPage />} />
        <Route path="settings/users" element={<UsersPage />} />
        <Route path="settings/roles" element={<RolesPage />} />
        <Route path="settings/masters" element={<MastersPage />} />
        <Route path="settings/series" element={<SeriesPage />} />
        <Route path="settings/custom-fields" element={<CustomFieldsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
