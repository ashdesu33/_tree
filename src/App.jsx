// src/App.jsx
import React from "react";
import TimelineSection from "./features/timeline/TimelineSection";
import GraphSection from "./features/graph/GraphSection";
import Intro from "./features/intro/intro"
import TopNav from "./features/topNav/TopNav"
import "./App.css";

function App() {
  return (
    <>
      <TopNav />
      <section id="about"><Intro /></section>
      <section id="timeline"><TimelineSection /></section>
      <section id="graph"><GraphSection /></section>
    </>
  );
}

export default App;