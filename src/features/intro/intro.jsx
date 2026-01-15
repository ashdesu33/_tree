import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Intro.css";

export default function Intro(){
    return(
        <div class="introContainer">
            <h1 class="intro-title">
                About
            </h1>
            <p class="description">
                This website documents the transformations of Khirbet Umm al-Kheir in the Masafer Yatta region through three interconnected components: a family tree, a materials index, and a historical timeline.
                <br/><br></br>
                The purpose of the family tree is to record names, relations, and generations that are otherwise erased from official archives. In a context where Palestinian existence is often reduced to cases, numbers, or “structures,” the family tree insists on naming life itself—mapping kinship, continuity, and the accumulation of lives lived in a place. It is not a genealogical claim to property, but a record of presence, care, and intergenerational endurance.
                <br/><br></br>
                The purpose of the materials index is to gather, organize, and cross-reference dispersed sources related to Umm al-Kheir and Masafer Yatta. These include oral testimonies, photographs, videos, maps, legal documents, media reports, and field notes. Bringing these materials together makes visible how administrative power, military planning, and settler expansion operate across time, while also preserving everyday records that are usually excluded from formal documentation.
                <br/><br></br>
                The purpose of the timeline is to situate Umm al-Kheir within longer historical processes: displacement, occupation, militarization, settlement expansion, and repeated demolition. While connecting these structural events to specific moments in village life. The timeline does not present history as a closed past, but as an ongoing sequence in which policy decisions, legal rulings, and acts of violence continue to shape the present.
                <br/><br></br>
                Together, these three elements form a living record: not only of destruction and loss, but of the lives that persist, relate, and create possibilities under conditions designed to make life disappear.
            </p>
        </div>
    )
}