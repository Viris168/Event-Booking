import { useMemo } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function KhqrCard({
  qrPayload,
  merchantName = 'Vireak Sok',
  amountUsdCents,
  amountKhr,
  currency = 'USD',
  centerIcon
}) {
  // Format price dynamically based on currency
  const formattedPrice = useMemo(() => {
    if (currency === 'KHR' && amountKhr != null) {
      return `៛ ${Number(amountKhr).toLocaleString()}`
    }
    if (amountUsdCents != null) {
      return `$${(amountUsdCents / 100).toFixed(2)}`
    }
    return null
  }, [amountUsdCents, amountKhr, currency])

  return (
    <div className="mx-auto max-w-[360px] rounded-[16px] bg-white shadow-sm overflow-hidden text-gray-900 border border-gray-200">
      {/* 1. KHQR Red Header Bar */}
      <div className="bg-[#E11D2A] h-[56px] flex items-center justify-center">
        <span className="text-white text-xl font-bold tracking-widest font-sans">
          KHQR
        </span>
      </div>

      {/* 2. Merchant Info & Dynamic Price Section */}
      <div className="px-6 pt-5 pb-4 bg-white">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-medium text-gray-900 truncate">
            {merchantName}
          </h2>
          {formattedPrice && (
            <span className="text-[#E11D2A] text-[16px] font-bold shrink-0">
              {formattedPrice}
            </span>
          )}
        </div>
      </div>

      {/* 3. Dashed Divider Line */}
      <div className="px-6">
        <div className="w-full border-t border-dashed border-gray-400" />
      </div>

      {/* 4. QR Code Display Section */}
      <div className="p-8 bg-white flex flex-col items-center justify-center">
        {qrPayload ? (
          <div className="relative flex items-center justify-center">
            <QRCodeSVG
              value={qrPayload}
              size={240}
              level="M"
              includeMargin={false}
            />
            {centerIcon && (
              <div className="absolute flex items-center justify-center bg-white rounded-full p-1 shadow-sm">
                {centerIcon}
              </div>
            )}
          </div>
        ) : (
          <div className="w-[240px] h-[240px] bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
            No QR Data
          </div>
        )}
      </div>
    </div>
  )
}
