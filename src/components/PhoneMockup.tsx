import { Flame } from "lucide-react";

const PhoneMockup = () => {
  const days = [
    { day: "M", date: 3 },
    { day: "T", date: 4 },
    { day: "W", date: 5 },
    { day: "T", date: 6 },
    { day: "F", date: 7 },
    { day: "S", date: 8, active: true },
    { day: "S", date: 9 },
  ];

  return (
    <div className="relative mx-auto w-[260px]">
      {/* iPhone Frame */}
      <div className="relative overflow-hidden rounded-[40px] bg-[#1a1a1a] p-[3px] ring-1 ring-white/10">
        {/* Inner screen */}
        <div className="relative overflow-hidden rounded-[37px] bg-black">
          {/* Dynamic Island */}
          <div className="absolute left-1/2 top-3 z-20 h-[18px] w-[70px] -translate-x-1/2 rounded-full bg-black" />
          
          {/* Screen Content */}
          <div className="relative px-4 pb-4 pt-10">
            {/* Status Bar */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white">why.ai</span>
              <div className="flex items-center gap-1.5">
                {/* Signal bars */}
                <div className="flex items-end gap-[2px]">
                  <div className="h-[4px] w-[3px] rounded-sm bg-white" />
                  <div className="h-[6px] w-[3px] rounded-sm bg-white" />
                  <div className="h-[8px] w-[3px] rounded-sm bg-white" />
                  <div className="h-[4px] w-[3px] rounded-sm bg-white/30" />
                </div>
                {/* Battery */}
                <div className="flex h-[10px] w-[20px] items-center rounded-[2px] border border-white/40 p-[1.5px] ml-1">
                  <div className="h-full w-[70%] rounded-[1px] bg-white" />
                </div>
              </div>
            </div>

            {/* Week Calendar */}
            <div className="mt-4 flex justify-between px-1">
              {days.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-zinc-500">{d.day}</span>
                  <div
                    className={`flex h-[24px] w-[24px] items-center justify-center rounded-full text-[11px] font-semibold ${
                      d.active
                        ? "bg-white text-black"
                        : "text-white"
                    }`}
                  >
                    {d.date}
                  </div>
                </div>
              ))}
            </div>

            {/* Calories Card */}
            <div className="mt-4 rounded-2xl bg-[#1c1c1e] p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[30px] font-bold leading-none text-white">1,599</p>
                  <p className="mt-1 text-[11px] text-zinc-400">Calories remaining</p>
                </div>
                {/* Circular Progress Ring with Flame */}
                <div className="relative flex h-[48px] w-[48px] items-center justify-center">
                  <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 48 48">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="#3f3f46"
                      strokeWidth="3"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="none"
                      stroke="url(#flameGradient)"
                      strokeWidth="3"
                      strokeDasharray="88, 126"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="flameGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <Flame className="h-4 w-4 text-orange-500" fill="#f97316" />
                </div>
              </div>
            </div>

            {/* Macros Row */}
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {/* Protein */}
              <div className="rounded-xl bg-[#1c1c1e] px-2.5 py-2.5">
                <p className="text-[15px] font-bold text-white">45g</p>
                <p className="text-[8px] text-zinc-400 mt-0.5">Protein left</p>
                <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-zinc-700">
                  <div className="h-full w-[65%] rounded-full bg-gradient-to-r from-pink-500 to-pink-400" />
                </div>
              </div>
              {/* Carbs */}
              <div className="rounded-xl bg-[#1c1c1e] px-2.5 py-2.5">
                <p className="text-[15px] font-bold text-white">25g</p>
                <p className="text-[8px] text-zinc-400 mt-0.5">Carbs left</p>
                <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-zinc-700">
                  <div className="h-full w-[45%] rounded-full bg-gradient-to-r from-yellow-500 to-amber-400" />
                </div>
              </div>
              {/* Fat */}
              <div className="rounded-xl bg-[#1c1c1e] px-2.5 py-2.5">
                <p className="text-[15px] font-bold text-white">5g</p>
                <p className="text-[8px] text-zinc-400 mt-0.5">Fat left</p>
                <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-zinc-700">
                  <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" />
                </div>
              </div>
            </div>

            {/* Recently Logged */}
            <div className="mt-3">
              <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
                Recently Logged
              </p>
              <div className="flex items-center gap-2.5 rounded-xl bg-[#1c1c1e] p-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600/30 text-sm">
                  🥪
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-white">Turkey Sandwich</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="inline-block h-[5px] w-[5px] rounded-full bg-blue-400" />
                    <p className="text-[9px] text-zinc-400">550 cal</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom spacing */}
            <div className="h-28" />

            {/* Home Indicator */}
            <div className="mx-auto h-[4px] w-[90px] rounded-full bg-zinc-600" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneMockup;