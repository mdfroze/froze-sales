import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query 
} from 'firebase/firestore';
import {
  Smartphone,
  Plus,
  Search,
  MapPin,
  TrendingUp,
  Share2,
  DollarSign,
  History,
  CheckCircle2,
  ArrowRightLeft,
  X,
  Camera,
  Trash2,
  Edit2,
  LogOut,
  Building2,
  Phone,
  FileSpreadsheet,
  Maximize2
} from 'lucide-react';

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDQ6FL9NF0ez_f_Nd25fVN03m23x10gLF0",
  authDomain: "frozesalestrack.firebaseapp.com",
  projectId: "frozesalestrack",
  storageBucket: "frozesalestrack.firebasestorage.app",
  messagingSenderId: "777591062205",
  appId: "1:777591062205:web:7395a75c313db5fbca81d4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper: Compress photo on client-side before storing to avoid database limits
const compressImage = (file, maxWidth = 900, quality = 0.7) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
    };
    reader.onerror = () => resolve(null);
  });
};

export default function App() {
  // Authentication State
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  // App Data State
  const [devices, setDevices] = useState([]);
  const [shops, setShops] = useState(['My Home Stock', 'City Mobile Care', 'Star Telecom', 'Digital Hub']);
  const [currency, setCurrency] = useState('₹');

  // UI Navigation & Filters
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'sold' | 'shops' | 'analytics'
  const [filterShop, setFilterShop] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMsg, setToastMsg] = useState(null);

  // Modals / Sheets
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [showMoveModal, setShowMoveModal] = useState(null);
  const [showSoldModal, setShowSoldModal] = useState(null);
  const [showShareModal, setShowShareModal] = useState(null);
  const [showImagePreview, setShowImagePreview] = useState(null);

  // Form States
  const [formData, setFormData] = useState({
    model: '',
    brand: 'Apple',
    variant: '128GB',
    color: '',
    imei: '',
    costPrice: '',
    condition: 'Excellent',
    currentShop: 'My Home Stock',
    notes: '',
    photos: []
  });

  const [soldPriceInput, setSoldPriceInput] = useState('');
  const [buyerInput, setBuyerInput] = useState('');
  const [moveDestination, setMoveDestination] = useState('');
  const [moveNote, setMoveNote] = useState('');
  const [sharePhoneInput, setSharePhoneInput] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [editingShopIdx, setEditingShopIdx] = useState(null);
  const [editingShopVal, setEditingShopVal] = useState('');

  const fileInputRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Firestore Real-Time Sync
  useEffect(() => {
    if (!user) {
      setDevices([]);
      return;
    }

    const devicesCol = collection(db, 'users', user.uid, 'devices');
    const unsubscribeDevices = onSnapshot(devicesCol, (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
      setDevices(items);
    });

    const shopsCol = collection(db, 'users', user.uid, 'settings');
    const unsubscribeShops = onSnapshot(shopsCol, (snapshot) => {
      snapshot.forEach((docSnap) => {
        if (docSnap.id === 'shops_list' && docSnap.data().items) {
          setShops(docSnap.data().items);
        }
      });
    });

    return () => {
      unsubscribeDevices();
      unsubscribeShops();
    };
  }, [user]);

  // Auth Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  const handleSignOut = () => {
    signOut(auth);
    showToast('Signed out');
  };

  // Sync Shops Helper
  const syncShopsToCloud = async (updatedList) => {
    setShops(updatedList);
    if (user) {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'shops_list'), { items: updatedList });
    }
  };

  // Image Upload Handling
  const handlePhotoCapture = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const compressedList = [];
    for (const f of files) {
      const b64 = await compressImage(f);
      if (b64) compressedList.push(b64);
    }
    setFormData((prev) => ({
      ...prev,
      photos: [...prev.photos, ...compressedList]
    }));
  };

  // Save / Update Device
  const handleSaveDevice = async (e) => {
    e.preventDefault();
    if (!formData.model || !formData.costPrice) {
      alert('Please provide at least a Model name and Cost Price');
      return;
    }

    const deviceId = editingDevice ? editingDevice.id : `dev_${Date.now()}`;
    const now = new Date().toISOString();

    const devicePayload = {
      model: formData.model.trim(),
      brand: formData.brand.trim(),
      variant: formData.variant.trim(),
      color: formData.color.trim(),
      imei: formData.imei.trim(),
      costPrice: parseFloat(formData.costPrice) || 0,
      condition: formData.condition,
      currentShop: formData.currentShop,
      notes: formData.notes.trim(),
      photos: formData.photos || [],
      status: editingDevice ? editingDevice.status : 'in_stock',
      createdAt: editingDevice ? editingDevice.createdAt : now,
      updatedAt: now,
      locationHistory: editingDevice
        ? editingDevice.locationHistory
        : [
            {
              shop: formData.currentShop,
              timestamp: now,
              note: 'Initial Stock Intake'
            }
          ]
    };

    if (editingDevice && editingDevice.soldPrice !== undefined) {
      devicePayload.soldPrice = editingDevice.soldPrice;
      devicePayload.soldDate = editingDevice.soldDate;
      devicePayload.buyer = editingDevice.buyer;
      devicePayload.soldAtShop = editingDevice.soldAtShop;
    }

    try {
      await setDoc(doc(db, 'users', user.uid, 'devices', deviceId), devicePayload);
      showToast(editingDevice ? 'Device updated' : 'Device added to inventory');
      setShowDeviceModal(false);
      setEditingDevice(null);
    } catch (err) {
      alert('Error saving device: ' + err.message);
    }
  };

  // Delete Device
  const handleDeleteDevice = async (devId) => {
    if (!confirm('Are you sure you want to permanently delete this device?')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'devices', devId));
      showToast('Device removed');
    } catch (err) {
      alert('Could not delete: ' + err.message);
    }
  };

  // Record Sale & Profit
  const handleConfirmSold = async (e) => {
    e.preventDefault();
    if (!soldPriceInput) return;
    const saleAmount = parseFloat(soldPriceInput) || 0;
    const now = new Date().toISOString();

    const updatedDev = {
      ...showSoldModal,
      status: 'sold',
      soldPrice: saleAmount,
      soldDate: now,
      buyer: buyerInput.trim() || 'Direct Buyer',
      soldAtShop: showSoldModal.currentShop,
      updatedAt: now
    };

    try {
      await setDoc(doc(db, 'users', user.uid, 'devices', showSoldModal.id), updatedDev);
      showToast(`Sold for ${currency}${saleAmount.toLocaleString()}!`);
      setShowSoldModal(null);
      setSoldPriceInput('');
      setBuyerInput('');
    } catch (err) {
      alert('Error recording sale: ' + err.message);
    }
  };

  // Move Device to Shop
  const handleConfirmMove = async (e) => {
    e.preventDefault();
    if (!moveDestination || moveDestination === showMoveModal.currentShop) {
      alert('Select a different destination shop');
      return;
    }
    const now = new Date().toISOString();
    const updatedHistory = [
      {
        shop: moveDestination,
        timestamp: now,
        note: moveNote.trim() || `Transferred from ${showMoveModal.currentShop}`
      },
      ...(showMoveModal.locationHistory || [])
    ];

    const updatedDev = {
      ...showMoveModal,
      currentShop: moveDestination,
      locationHistory: updatedHistory,
      updatedAt: now
    };

    try {
      await setDoc(doc(db, 'users', user.uid, 'devices', showMoveModal.id), updatedDev);
      showToast(`Moved to ${moveDestination}`);
      setShowMoveModal(null);
      setMoveDestination('');
      setMoveNote('');
    } catch (err) {
      alert('Error moving device: ' + err.message);
    }
  };

  // WhatsApp Share Generator
  const sendWhatsAppCard = (device, customPhone = '') => {
    const text = 
      `📱 *${device.brand} ${device.model}* (${device.variant || ''})\n` +
      `🎨 *Color:* ${device.color || 'N/A'}\n` +
      `✨ *Condition:* ${device.condition}\n` +
      (device.imei ? `🔢 *IMEI/Serial:* ${device.imei}\n` : '') +
      `📍 *Location:* ${device.currentShop}\n` +
      `🏷️ *Status:* ${device.status === 'sold' ? 'Sold Out' : 'Ready in Stock'}\n` +
      (device.notes ? `📝 *Note:* ${device.notes}\n` : '') +
      `\n_Sent via Mobile Sales Tracker_`;

    const cleanPhone = customPhone.replace(/[^0-9]/g, '');
    const url = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

    window.open(url, '_blank');
  };

  // Export CSV
  const exportToCSV = () => {
    const headers = ['Model', 'Brand', 'Variant', 'Color', 'IMEI', 'Status', 'Current Shop', 'Cost Price', 'Sold Price', 'Net Profit', 'Sold Date', 'Buyer'];
    const rows = devices.map(d => {
      const isSold = d.status === 'sold';
      const profit = isSold ? (d.soldPrice || 0) - (d.costPrice || 0) : '';
      return [
        `"${d.model}"`,
        `"${d.brand}"`,
        `"${d.variant || ''}"`,
        `"${d.color || ''}"`,
        `"${d.imei || ''}"`,
        d.status,
        `"${d.currentShop}"`,
        d.costPrice || 0,
        isSold ? (d.soldPrice || 0) : '',
        profit,
        d.soldDate ? new Date(d.soldDate).toLocaleDateString() : '',
        `"${d.buyer || ''}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mobile_sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Lists & Metrics
  const inStockDevices = useMemo(() => {
    return devices.filter(d => d.status !== 'sold');
  }, [devices]);

  const soldDevices = useMemo(() => {
    return devices.filter(d => d.status === 'sold');
  }, [devices]);

  const displayList = useMemo(() => {
    const targetList = activeTab === 'sold' ? soldDevices : inStockDevices;
    return targetList.filter(d => {
      const matchesShop = filterShop === 'all' || d.currentShop === filterShop;
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        d.model.toLowerCase().includes(q) ||
        d.brand.toLowerCase().includes(q) ||
        (d.imei && d.imei.toLowerCase().includes(q)) ||
        (d.variant && d.variant.toLowerCase().includes(q));
      return matchesShop && matchesSearch;
    });
  }, [activeTab, soldDevices, inStockDevices, filterShop, searchQuery]);

  // Analytics Metrics
  const analytics = useMemo(() => {
    const totalCostInStock = inStockDevices.reduce((sum, d) => sum + (parseFloat(d.costPrice) || 0), 0);
    const totalRevenue = soldDevices.reduce((sum, d) => sum + (parseFloat(d.soldPrice) || 0), 0);
    const totalCostOfSold = soldDevices.reduce((sum, d) => sum + (parseFloat(d.costPrice) || 0), 0);
    const netProfit = totalRevenue - totalCostOfSold;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    return {
      totalCostInStock,
      totalRevenue,
      netProfit,
      profitMargin,
      inStockCount: inStockDevices.length,
      soldCount: soldDevices.length
    };
  }, [inStockDevices, soldDevices]);

  // 3. Render Login Screen if not authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <Smartphone className="w-12 h-12 text-blue-500 animate-pulse mb-3" />
        <p className="text-sm text-slate-400 font-mono">Connecting to Froze Sales Track...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 selection:bg-blue-600">
        <div className="w-full max-w-sm bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/40 rounded-2xl flex items-center justify-center mb-3 text-blue-400">
              <Smartphone className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Froze Mobile Vault</h1>
            <p className="text-xs text-slate-400 mt-1">Personal mobile sales & consignment tracking</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Email</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Password</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-blue-600/30 text-white"
            >
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError('');
              }}
              className="text-xs text-slate-400 hover:text-blue-400 transition-colors"
            >
              {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans max-w-lg mx-auto border-x border-slate-800/60 pb-24 shadow-2xl relative">
      {/* Toast Pill */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs font-medium px-4 py-2 rounded-full border border-slate-700 shadow-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">Froze Sales Track</h1>
            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => setCurrency(c => c === '₹' ? '$' : '₹')}
            className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white"
          >
            {currency}
          </button>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 rounded-md hover:bg-slate-900 text-slate-400 hover:text-rose-400"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="px-3 pt-3">
        <div className="grid grid-cols-4 bg-slate-900/90 p-1 rounded-2xl border border-slate-800/80 text-xs font-medium text-slate-400">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`py-2 rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-blue-600 text-white shadow-sm' : 'hover:text-slate-200'}`}
          >
            Stock ({inStockDevices.length})
          </button>
          <button
            onClick={() => setActiveTab('sold')}
            className={`py-2 rounded-xl transition-all ${activeTab === 'sold' ? 'bg-blue-600 text-white shadow-sm' : 'hover:text-slate-200'}`}
          >
            Sold ({soldDevices.length})
          </button>
          <button
            onClick={() => setActiveTab('shops')}
            className={`py-2 rounded-xl transition-all ${activeTab === 'shops' ? 'bg-blue-600 text-white shadow-sm' : 'hover:text-slate-200'}`}
          >
            Shops
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-2 rounded-xl transition-all ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-sm' : 'hover:text-slate-200'}`}
          >
            Reports
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="p-3 flex-1 flex flex-col space-y-3">
        {/* INVENTORY & SOLD VIEWS */}
        {(activeTab === 'inventory' || activeTab === 'sold') && (
          <>
            {/* Search & Location Filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search model, brand, IMEI..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white"
                />
              </div>

              <select
                value={filterShop}
                onChange={(e) => setFilterShop(e.target.value)}
                className="bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Shops</option>
                {shops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* List */}
            {displayList.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl my-4">
                <Smartphone className="w-10 h-10 mb-2 stroke-[1.2] text-slate-600" />
                <p className="text-xs font-medium">No devices found</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {activeTab === 'inventory' ? 'Tap + Add Mobile below to register inventory' : 'Mark devices as sold to see them here'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayList.map((dev) => {
                  const isSold = dev.status === 'sold';
                  const profit = isSold ? (dev.soldPrice || 0) - (dev.costPrice || 0) : 0;

                  return (
                    <div 
                      key={dev.id} 
                      className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 shadow-sm transition-all hover:border-slate-700"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex gap-3">
                          {/* Photo Thumbnail */}
                          {dev.photos && dev.photos.length > 0 ? (
                            <div 
                              onClick={() => setShowImagePreview(dev.photos[0])}
                              className="w-12 h-12 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0 relative border border-slate-700 cursor-pointer"
                            >
                              <img src={dev.photos[0]} alt={dev.model} className="w-full h-full object-cover" />
                              {dev.photos.length > 1 && (
                                <span className="absolute bottom-0 right-0 bg-black/70 text-[9px] px-1 text-white font-mono">
                                  +{dev.photos.length - 1}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center flex-shrink-0 text-slate-500">
                              <Smartphone className="w-6 h-6" />
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md border border-blue-500/20">
                                {dev.brand}
                              </span>
                              <h3 className="text-xs font-bold text-white">{dev.model}</h3>
                              {dev.variant && <span className="text-[10px] text-slate-400">({dev.variant})</span>}
                            </div>

                            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              <span className="truncate max-w-[160px] font-medium text-slate-300">
                                {isSold ? `Sold via ${dev.soldAtShop || dev.currentShop}` : dev.currentShop}
                              </span>
                            </p>

                            {dev.imei && (
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                IMEI: {dev.imei}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Price Badge */}
                        <div className="text-right flex-shrink-0">
                          {isSold ? (
                            <div>
                              <p className="text-xs font-bold text-emerald-400">
                                {currency}{(dev.soldPrice || 0).toLocaleString()}
                              </p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${profit >= 0 ? 'bg-emerald-950/60 text-emerald-300' : 'bg-rose-950/60 text-rose-300'}`}>
                                {profit >= 0 ? `+${currency}${profit.toLocaleString()}` : `-${currency}${Math.abs(profit).toLocaleString()}`}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <p className="text-[10px] text-slate-400">Cost Price</p>
                              <p className="text-xs font-bold text-white">
                                {currency}{(dev.costPrice || 0).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          {/* Share on WhatsApp */}
                          <button
                            onClick={() => setShowShareModal(dev)}
                            className="p-1.5 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900/60"
                            title="Share on WhatsApp"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Details */}
                          <button
                            onClick={() => {
                              setEditingDevice(dev);
                              setFormData({
                                model: dev.model,
                                brand: dev.brand || 'Apple',
                                variant: dev.variant || '',
                                color: dev.color || '',
                                imei: dev.imei || '',
                                costPrice: dev.costPrice || '',
                                condition: dev.condition || 'Excellent',
                                currentShop: dev.currentShop,
                                notes: dev.notes || '',
                                photos: dev.photos || []
                              });
                              setShowDeviceModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700"
                            title="Edit Device"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteDevice(dev.id)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Move / Mark Sold Buttons */}
                        {!isSold && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setShowMoveModal(dev);
                                setMoveDestination(shops[0] !== dev.currentShop ? shops[0] : (shops[1] || ''));
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1"
                            >
                              <ArrowRightLeft className="w-3 h-3 text-amber-400" />
                              <span>Transfer</span>
                            </button>

                            <button
                              onClick={() => {
                                setShowSoldModal(dev);
                                setSoldPriceInput('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm flex items-center gap-1"
                            >
                              <DollarSign className="w-3 h-3" />
                              <span>Mark Sold</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* SHOPS MANAGEMENT VIEW */}
        {activeTab === 'shops' && (
          <div className="space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-400" />
                <span>Partner Friend Shops</span>
              </h2>
              <p className="text-[11px] text-slate-400 mb-3">
                Manage partner shops where you consign mobile devices.
              </p>

              {/* Add New Shop Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New shop name..."
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    if (!newShopName.trim()) return;
                    if (shops.includes(newShopName.trim())) {
                      alert('Shop already exists');
                      return;
                    }
                    syncShopsToCloud([...shops, newShopName.trim()]);
                    setNewShopName('');
                    showToast('Shop added');
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Existing Shops List */}
            <div className="space-y-2">
              {shops.map((shop, idx) => {
                const countAtShop = devices.filter(d => d.status !== 'sold' && d.currentShop === shop).length;
                const isEditing = editingShopIdx === idx;

                return (
                  <div key={idx} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
                    {isEditing ? (
                      <div className="flex-1 flex gap-2 mr-2">
                        <input
                          type="text"
                          value={editingShopVal}
                          onChange={(e) => setEditingShopVal(e.target.value)}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                        />
                        <button
                          onClick={() => {
                            if (!editingShopVal.trim()) return;
                            const updated = [...shops];
                            const oldName = updated[idx];
                            updated[idx] = editingShopVal.trim();
                            syncShopsToCloud(updated);
                            // Also update devices currently at oldName
                            devices.forEach(async (d) => {
                              if (d.currentShop === oldName) {
                                await setDoc(doc(db, 'users', user.uid, 'devices', d.id), { ...d, currentShop: editingShopVal.trim() });
                              }
                            });
                            setEditingShopIdx(null);
                            showToast('Shop updated');
                          }}
                          className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-xs"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-blue-400" />
                        <div>
                          <p className="text-xs font-semibold text-white">{shop}</p>
                          <p className="text-[10px] text-slate-400">{countAtShop} active in stock</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingShopIdx(idx);
                            setEditingShopVal(shop);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {shops.length > 1 && (
                        <button
                          onClick={() => {
                            if (countAtShop > 0) {
                              alert(`Move the ${countAtShop} devices currently at ${shop} before deleting it.`);
                              return;
                            }
                            if (confirm(`Delete ${shop}?`)) {
                              syncShopsToCloud(shops.filter((_, i) => i !== idx));
                              showToast('Shop deleted');
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ANALYTICS & REPORTS VIEW */}
        {activeTab === 'analytics' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Financial Overview</h2>
              <button
                onClick={exportToCSV}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl">
                <p className="text-[10px] text-slate-400 font-medium">Realized Profit</p>
                <p className="text-lg font-bold text-emerald-400 mt-0.5">
                  {currency}{analytics.netProfit.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">{analytics.soldCount} devices sold</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl">
                <p className="text-[10px] text-slate-400 font-medium">Capital in Stock</p>
                <p className="text-lg font-bold text-blue-400 mt-0.5">
                  {currency}{analytics.totalCostInStock.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">{analytics.inStockCount} unsold items</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl">
                <p className="text-[10px] text-slate-400 font-medium">Gross Sales</p>
                <p className="text-base font-bold text-white mt-0.5">
                  {currency}{analytics.totalRevenue.toLocaleString()}
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl">
                <p className="text-[10px] text-slate-400 font-medium">Margin Ratio</p>
                <p className="text-base font-bold text-amber-400 mt-0.5">
                  {analytics.profitMargin}%
                </p>
              </div>
            </div>

            {/* Consignment Distribution Breakdown */}
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl">
              <h3 className="text-xs font-bold text-white mb-2">Shop Inventory Distribution</h3>
              <div className="space-y-2">
                {shops.map(shop => {
                  const shopCount = inStockDevices.filter(d => d.currentShop === shop).length;
                  const percent = inStockDevices.length > 0 ? (shopCount / inStockDevices.length) * 100 : 0;
                  return (
                    <div key={shop} className="text-xs">
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>{shop}</span>
                        <span className="font-semibold">{shopCount} phones ({percent.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Add Device Button */}
      {activeTab === 'inventory' && (
        <div className="fixed bottom-6 right-6 z-40 max-w-lg">
          <button
            onClick={() => {
              setEditingDevice(null);
              setFormData({
                model: '',
                brand: 'Apple',
                variant: '128GB',
                color: '',
                imei: '',
                costPrice: '',
                condition: 'Excellent',
                currentShop: shops[0] || 'My Home Stock',
                notes: '',
                photos: []
              });
              setShowDeviceModal(true);
            }}
            className="w-13 h-13 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-xl shadow-blue-600/40 transition-transform active:scale-95"
            title="Add Device"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
      )}

      {/* --- MODAL: ADD / EDIT DEVICE --- */}
      {showDeviceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold text-white">
                {editingDevice ? 'Edit Mobile' : 'Add New Mobile'}
              </h2>
              <button 
                onClick={() => setShowDeviceModal(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDevice} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Brand</label>
                  <select
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  >
                    {['Apple', 'Samsung', 'OnePlus', 'Google Pixel', 'Xiaomi', 'Vivo', 'Oppo', 'Realme', 'Other'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Model Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. iPhone 14 Pro"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Storage / Variant</label>
                  <input
                    type="text"
                    placeholder="128GB / 8GB RAM"
                    value={formData.variant}
                    onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Color</label>
                  <input
                    type="text"
                    placeholder="e.g. Space Black"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Cost Price ({currency}) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Stocked At Shop</label>
                  <select
                    value={formData.currentShop}
                    onChange={(e) => setFormData({ ...formData, currentShop: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  >
                    {shops.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  >
                    {['Brand New Sealed', 'Like New / Mint', 'Excellent', 'Good', 'Fair / Minor Scratches'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">IMEI / Serial</label>
                  <input
                    type="text"
                    placeholder="Optional IMEI"
                    value={formData.imei}
                    onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Photos Capture */}
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Photos</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoCapture}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 flex items-center gap-1.5 hover:bg-slate-700"
                  >
                    <Camera className="w-3.5 h-3.5 text-blue-400" />
                    <span>Upload / Camera</span>
                  </button>

                  {formData.photos.map((p, i) => (
                    <div key={i} className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-700">
                      <img src={p} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, photos: formData.photos.filter((_, idx) => idx !== i) })}
                        className="absolute top-0 right-0 bg-red-600 text-white w-3.5 h-3.5 flex items-center justify-center text-[9px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Notes / Faults</label>
                <input
                  type="text"
                  placeholder="Battery health, included box, warranty..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition-colors mt-2"
              >
                {editingDevice ? 'Save Changes' : 'Add to Inventory'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: MARK SOLD --- */}
      {showSoldModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-white">Record Mobile Sale</h2>
              <button onClick={() => setShowSoldModal(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Selling <strong className="text-white">{showSoldModal.brand} {showSoldModal.model}</strong> (Cost: {currency}{showSoldModal.costPrice})
            </p>

            <form onSubmit={handleConfirmSold} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Final Selling Price ({currency}) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={soldPriceInput}
                  onChange={(e) => setSoldPriceInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                />
              </div>

              {soldPriceInput && (
                <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex justify-between">
                  <span className="text-slate-400">Calculated Profit:</span>
                  <span className={`font-bold ${parseFloat(soldPriceInput) - showSoldModal.costPrice >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {currency}{(parseFloat(soldPriceInput) - showSoldModal.costPrice).toLocaleString()}
                  </span>
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Buyer Name / Customer</label>
                <input
                  type="text"
                  placeholder="e.g. Walk-in or Customer Name"
                  value={buyerInput}
                  onChange={(e) => setBuyerInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white shadow-lg shadow-emerald-600