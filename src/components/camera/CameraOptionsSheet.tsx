import { X, Pencil, ScanLine } from "lucide-react";

interface CameraOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOption: (option: 'scan' | 'describe') => void;
}

export const CameraOptionsSheet = ({ isOpen, onClose, onSelectOption }: CameraOptionsSheetProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      
      {/* Sheet */}
      <div 
        className="absolute bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl animate-slide-up"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3">
          <h2 className="text-white text-lg font-semibold">Add Food</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        
        {/* Options */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-3">
          {/* Describe Food */}
          <button
            onClick={() => onSelectOption('describe')}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
              <Pencil className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-medium text-sm">Describe food</span>
          </button>
          
          {/* Scan Food */}
          <button
            onClick={() => onSelectOption('scan')}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
              <ScanLine className="w-6 h-6 text-white" />
            </div>
            <span className="text-white font-medium text-sm">Scan food</span>
          </button>
        </div>
      </div>
    </div>
  );
};
