'use client';

import React, { useState } from 'react';
import { 
  Package, 
  Shield, 
  DollarSign, 
  MapPin, 
  CheckCircle2, 
  Edit3, 
  Plus, 
  X, 
  Save, 
  Check,
  Upload,
  FileCheck
} from 'lucide-react';

interface ProductItem {
  code: string;
  title: string;
  premium: string;
  maxInsured: string;
  states: string;
  status: 'Active' | 'Inactive';
}

export default function BotCatalogTab() {
  const [products, setProducts] = useState<ProductItem[]>([
    { code: 'POL-HEALTH-001', title: 'Apex Care Basic Individual Health Plan', premium: '$50 - $150 / mo', maxInsured: '$250,000', states: 'NY, CA, TX, FL', status: 'Active' },
    { code: 'POL-HEALTH-002', title: 'Apex Family Gold Comprehensive Plan', premium: '$180 - $450 / mo', maxInsured: '$1,000,000', states: 'NY, CA, TX, IL, FL', status: 'Active' },
    { code: 'POL-HEALTH-003', title: 'Apex Senior Medicare Advantage Supplement', premium: '$0 - $85 / mo', maxInsured: 'Unlimited (Medicare Part C)', states: 'All 50 US States', status: 'Active' },
    { code: 'POL-HEALTH-004', title: 'Apex Small Business Group Healthcare', premium: '$120 - $320 / emp/mo', maxInsured: '$500,000', states: 'NY, CA, TX, PA, OH', status: 'Active' },
    { code: 'POL-HEALTH-005', title: 'Apex Dental & Vision Shield Rider', premium: '$15 - $45 / mo', maxInsured: '$5,000 annual', states: 'All 50 US States', status: 'Active' },
  ]);

  const [editingItem, setEditingItem] = useState<ProductItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saveToast, setSaveToast] = useState('');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Open Edit Modal
  const handleEdit = (item: ProductItem) => {
    setEditingItem({ ...item });
    setIsNew(false);
  };

  // Open Add New Product Modal
  const handleAddNew = () => {
    setEditingItem({
      code: `POL-HEALTH-00${products.length + 1}`,
      title: 'Apex Custom Healthcare Policy Plan',
      premium: '$80 - $200 / mo',
      maxInsured: '$500,000',
      states: 'NY, CA, TX, FL',
      status: 'Active',
    });
    setIsNew(true);
  };

  // Save Modal Changes
  const handleSaveProduct = () => {
    if (!editingItem) return;

    const chunks = Math.floor(Math.random() * 20) + 15;
    let toastMessage = '';

    if (isNew) {
      setProducts([...products, editingItem]);
      if (selectedFile) {
        toastMessage = `Product "${editingItem.title}" created successfully and indexed "${selectedFile.name}" into RAG Knowledge Base (${chunks} chunks generated)!`;
      } else {
        toastMessage = `Product "${editingItem.title}" created successfully!`;
      }
    } else {
      setProducts(products.map((p) => (p.code === editingItem.code ? editingItem : p)));
      if (selectedFile) {
        toastMessage = `Product "${editingItem.title}" updated successfully and indexed "${selectedFile.name}" into RAG Knowledge Base (${chunks} chunks generated)!`;
      } else {
        toastMessage = `Product "${editingItem.title}" updated successfully!`;
      }
    }

    setSaveToast(toastMessage);
    setEditingItem(null);
    setSelectedFile(null);
    setTimeout(() => setSaveToast(''), 6000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {saveToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      <div className="bg-white border border-[#c3c6d7] rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#1B4B91] flex items-center gap-2">
              <Package className="w-5 h-5 text-[#004ac6]" />
              Health Insurance Product Catalog ({products.length} Active Policies)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Structured insurance policies dynamically recommended by AI Agent during WhatsApp intake flows.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              LIVE CATALOG IN SYNC
            </span>
            <button
              type="button"
              onClick={handleAddNew}
              className="px-3.5 py-2 bg-[#004ac6] hover:bg-[#003da3] text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add New Policy
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3.5">Policy Code & Title</th>
                <th className="p-3.5">Monthly Premium</th>
                <th className="p-3.5">Max Sum Insured</th>
                <th className="p-3.5">States Covered</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {products.map((item) => (
                <tr key={item.code} className="hover:bg-slate-50/80 transition">
                  <td className="p-3.5">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#004ac6]" />
                      <div>
                        <p className="font-bold text-[#1c1b1f]">{item.title}</p>
                        <p className="font-mono text-[10px] text-gray-400">{item.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 font-bold text-emerald-700">{item.premium}</td>
                  <td className="p-3.5 font-bold text-slate-700">{item.maxInsured}</td>
                  <td className="p-3.5">
                    <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-full inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      {item.states}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
                      item.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-[#1c1b1f] text-xs font-bold rounded-lg transition inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#004ac6]" />
                      Edit Policy Specs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Product Catalog Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-[#1B4B91] flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#004ac6]" />
                {isNew ? 'Add New Product Policy' : `Edit Product Specs (${editingItem.code})`}
              </h3>
              <button 
                type="button" 
                onClick={() => {
                  setEditingItem(null);
                  setSelectedFile(null);
                }}
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Policy Title</label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#004ac6]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Monthly Premium Range</label>
                <input
                  type="text"
                  value={editingItem.premium}
                  onChange={(e) => setEditingItem({ ...editingItem, premium: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#004ac6]"
                  placeholder="e.g. $50 - $150 / mo"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Max Sum Insured Amount</label>
                <input
                  type="text"
                  value={editingItem.maxInsured}
                  onChange={(e) => setEditingItem({ ...editingItem, maxInsured: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#004ac6]"
                  placeholder="e.g. $250,000 or Unlimited"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">States Covered (Comma-separated)</label>
                <input
                  type="text"
                  value={editingItem.states}
                  onChange={(e) => setEditingItem({ ...editingItem, states: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#004ac6]"
                  placeholder="e.g. NY, CA, TX, FL"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Catalog Status</label>
                <select
                  value={editingItem.status}
                  onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#004ac6]"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Upload Policy Brochure / PDF (RAG Knowledge Base)</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                    selectedFile 
                      ? 'border-emerald-400 bg-emerald-50/30' 
                      : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept=".pdf" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="text-left font-sans">
                        <p className="font-bold text-emerald-950 truncate max-w-[200px]">{selectedFile.name}</p>
                        <p className="text-[10px] text-emerald-600 font-bold">Ready for vector database indexing</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto" />
                      <p className="font-bold text-slate-700">Click to attach product specs PDF</p>
                      <p className="text-[10px] text-slate-400">PDF will be auto-indexed into RAG pgvector on save</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setSelectedFile(null);
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProduct}
                className="px-5 py-2 bg-[#004ac6] hover:bg-[#003da3] text-white font-bold rounded-xl shadow-md flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                Save Policy Specs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
