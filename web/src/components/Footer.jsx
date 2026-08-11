import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { FX_RATE_KHR_PER_USD } from '../lib/format.js'

export default function Footer() {
  const { locale } = useLocale()
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <strong className="with-icon">
            <Icon name="ticket" size={16} />
            Event Booking Cambodia
          </strong>
          <div>
            {locale === 'km'
              ? 'កក់សំបុត្រព្រឹត្តិការណ៍ទូទាំងព្រះរាជាណាចក្រកម្ពុជា'
              : 'Ticketing for events across the Kingdom of Cambodia'}
          </div>
        </div>
        <div>
          <div className="with-icon">
            <Icon name="qr" size={14} />
            Bakong KHQR
            <span className="muted">·</span>
            <Icon name="bank" size={14} />
            ABA PayWay
          </div>
          <div>FX reference: 1 USD = {FX_RATE_KHR_PER_USD.toLocaleString('en-US')} KHR</div>
        </div>
        <div className="small with-icon">
          <Icon name="info" size={14} />
          UI prototype — all data is mock data, no API calls are made.
        </div>
      </div>
    </footer>
  )
}
