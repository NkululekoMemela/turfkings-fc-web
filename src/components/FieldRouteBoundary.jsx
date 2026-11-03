import React from 'react';
export default class FieldRouteBoundary extends React.Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error){console.error('[Field page]',error);}
 render(){return this.state.failed?<section className="card" role="alert"><h2>This Field page could not load</h2><p>Your Field data is unchanged. Return to Fields and try again.</p><button className="secondary-btn" onClick={this.props.onBack}>Back to Fields</button></section>:this.props.children;}
}
