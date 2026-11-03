import React from "react";
export default class BookingPageBoundary extends React.Component {
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){console.error("[BookingPage]",error,info.componentStack);}
  render(){
    if(!this.state.error)return this.props.children;
    return <main className="page"><section className="card" role="alert">
      <h1>Bookings could not open</h1>
      <p>Please retry. If it happens again, share the detail below so we can fix it.</p>
      <p className="error-text">{this.state.error.message || "Unexpected booking page error"}</p>
      <button className="primary-btn" onClick={()=>this.setState({error:null})}>Retry bookings</button>{" "}
      <button className="secondary-btn" onClick={this.props.onBack}>Back to club</button>
    </section></main>;
  }
}
