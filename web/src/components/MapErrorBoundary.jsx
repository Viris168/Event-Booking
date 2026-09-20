import { Component } from "react";
import Icon from "./Icon.jsx";

export default class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Map component crashed:", error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    // If the events list or locale changes, reset the error boundary
    if (
      this.state.hasError &&
      (prevProps.events !== this.props.events ||
        prevProps.pinnedId !== this.props.pinnedId)
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="events-map events-map-empty">
          <Icon name="alertCircle" size={26} />
          <p className="small muted">
            {this.props.locale === "km"
              ? "មិនអាចផ្ទុកផែនទីនៅពេលនេះទេ"
              : "Unable to load map at this moment."}
          </p>
          <button
            type="button"
            className="btn btn-sm btn-outline mt-2"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <Icon name="refresh" size={14} />
            <span>
              {this.props.locale === "km" ? "ព្យាយាមម្តងទៀត" : "Retry"}
            </span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
