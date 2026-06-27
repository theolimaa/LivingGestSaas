-- ============================================================
-- ROW LEVEL SECURITY — Condomínio Conectado
-- Execute este script no SQL Editor do Supabase Dashboard
-- ============================================================

-- condominiums: user_id direto na tabela
ALTER TABLE condominiums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "condominiums_select" ON condominiums FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "condominiums_insert" ON condominiums FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "condominiums_update" ON condominiums FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "condominiums_delete" ON condominiums FOR DELETE USING (auth.uid() = user_id);

-- apartments: filtro via condominium
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apartments_select" ON apartments FOR SELECT
  USING (EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));
CREATE POLICY "apartments_insert" ON apartments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));
CREATE POLICY "apartments_update" ON apartments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));
CREATE POLICY "apartments_delete" ON apartments FOR DELETE
  USING (EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));

-- tenants: filtro via apartment → condominium
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_select" ON tenants FOR SELECT
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "tenants_insert" ON tenants FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "tenants_update" ON tenants FOR UPDATE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "tenants_delete" ON tenants FOR DELETE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));

-- residents: filtro via tenant → apartment → condominium
ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "residents_select" ON residents FOR SELECT
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "residents_insert" ON residents FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "residents_update" ON residents FOR UPDATE
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "residents_delete" ON residents FOR DELETE
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));

-- contracts: filtro via tenant → apartment → condominium
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contracts_select" ON contracts FOR SELECT
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "contracts_insert" ON contracts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "contracts_update" ON contracts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "contracts_delete" ON contracts FOR DELETE
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));

-- financial_records: filtro via apartment → condominium
ALTER TABLE financial_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial_records_select" ON financial_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "financial_records_insert" ON financial_records FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "financial_records_update" ON financial_records FOR UPDATE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "financial_records_delete" ON financial_records FOR DELETE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));

-- documents: filtro via tenant → apartment → condominium
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_select" ON documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "documents_insert" ON documents FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "documents_update" ON documents FOR UPDATE
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));
CREATE POLICY "documents_delete" ON documents FOR DELETE
  USING (EXISTS (SELECT 1 FROM tenants t JOIN apartments a ON a.id = t.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE t.id = tenant_id AND c.user_id = auth.uid()));

-- previous_tenants: filtro via apartment → condominium
ALTER TABLE previous_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "previous_tenants_select" ON previous_tenants FOR SELECT
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "previous_tenants_insert" ON previous_tenants FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "previous_tenants_update" ON previous_tenants FOR UPDATE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "previous_tenants_delete" ON previous_tenants FOR DELETE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));

-- debt_agreements: filtro via apartment → condominium
ALTER TABLE debt_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debt_agreements_select" ON debt_agreements FOR SELECT
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "debt_agreements_insert" ON debt_agreements FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "debt_agreements_update" ON debt_agreements FOR UPDATE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));
CREATE POLICY "debt_agreements_delete" ON debt_agreements FOR DELETE
  USING (EXISTS (SELECT 1 FROM apartments a JOIN condominiums c ON c.id = a.condominium_id WHERE a.id = apartment_id AND c.user_id = auth.uid()));

-- debt_installments: filtro via debt_agreement → apartment → condominium
ALTER TABLE debt_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debt_installments_select" ON debt_installments FOR SELECT
  USING (EXISTS (SELECT 1 FROM debt_agreements da JOIN apartments a ON a.id = da.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE da.id = agreement_id AND c.user_id = auth.uid()));
CREATE POLICY "debt_installments_insert" ON debt_installments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM debt_agreements da JOIN apartments a ON a.id = da.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE da.id = agreement_id AND c.user_id = auth.uid()));
CREATE POLICY "debt_installments_update" ON debt_installments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM debt_agreements da JOIN apartments a ON a.id = da.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE da.id = agreement_id AND c.user_id = auth.uid()));
CREATE POLICY "debt_installments_delete" ON debt_installments FOR DELETE
  USING (EXISTS (SELECT 1 FROM debt_agreements da JOIN apartments a ON a.id = da.apartment_id JOIN condominiums c ON c.id = a.condominium_id WHERE da.id = agreement_id AND c.user_id = auth.uid()));

-- saved_receipts: já tem user_id direto
ALTER TABLE saved_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_receipts_select" ON saved_receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "saved_receipts_insert" ON saved_receipts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saved_receipts_update" ON saved_receipts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "saved_receipts_delete" ON saved_receipts FOR DELETE USING (auth.uid() = user_id);

-- company_financial_summary: filtro via condominium
ALTER TABLE company_financial_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_financial_summary_select" ON company_financial_summary FOR SELECT
  USING (condominium_id IS NULL OR EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));
CREATE POLICY "company_financial_summary_insert" ON company_financial_summary FOR INSERT
  WITH CHECK (condominium_id IS NULL OR EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));
CREATE POLICY "company_financial_summary_update" ON company_financial_summary FOR UPDATE
  USING (condominium_id IS NULL OR EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));
CREATE POLICY "company_financial_summary_delete" ON company_financial_summary FOR DELETE
  USING (condominium_id IS NULL OR EXISTS (SELECT 1 FROM condominiums c WHERE c.id = condominium_id AND c.user_id = auth.uid()));
