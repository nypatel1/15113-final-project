# SPEC.md — AI Posture Coach (Open-Ended Build Specification)

## Overview

This project is an AI-powered posture coaching web application that runs entirely in the browser. It uses real-time computer vision to analyze a user’s posture through their webcam and provides continuous feedback, scoring, and insights.

The goal is to create a **functional, extensible, and technically impressive system**, not just a fixed set of features. The implementation should prioritize **clear functionality, modular architecture, and thoughtful use of computer vision**, while remaining flexible enough to expand beyond the initial scope.

---

## Core Objective

Build a system that:

* Captures live video input from a user’s webcam
* Extracts meaningful body pose data using a computer vision model
* Analyzes posture using custom logic written by the developer
* Provides real-time feedback and visualizations
* Stores and reflects on historical posture data

---

## Guiding Principles

* **Open-ended implementation**: Do not limit design to predefined features if better ideas emerge
* **Substance over polish**: Prioritize working systems and meaningful logic over UI perfection
* **Modularity**: Keep components and logic cleanly separated and extensible
* **Explainability**: Ensure at least one substantial portion of logic is clearly written and understandable
* **Iterative enhancement**: Start with a minimal working system and build upward

---

## Functional Requirements

### 1. Real-Time Video Processing

* Access and display webcam feed in the browser
* Process frames continuously for analysis
* Ensure smooth performance suitable for real-time feedback

### 2. Pose Detection (Computer Vision / ML)

* Integrate a pose detection model capable of identifying human body landmarks
* Extract structured landmark data (e.g., coordinates of joints)
* Maintain continuous tracking across frames

### 3. Posture Analysis Engine (Custom Logic)

This is a critical component and should be **written or meaningfully modified by the developer**.

Possible directions include (but are not limited to):

* Angle calculations between joints
* Symmetry analysis (left vs right body alignment)
* Deviation from vertical or neutral posture
* Relative positioning of key body parts (head, shoulders, hips, etc.)

The system should:

* Translate raw landmark data into meaningful posture metrics
* Combine metrics into a unified posture score or classification
* Allow for extensibility (adding new metrics or improving models)

### 4. Feedback System

* Provide real-time feedback to the user based on posture quality
* Feedback may include visual indicators, scores, ratings, alerts, or warnings
* Feedback should be responsive and intuitive

### 5. Data Persistence

* Store posture data over time (e.g., periodic snapshots)
* Enable session tracking using local storage or another lightweight method
* Ensure data can be retrieved and used for analysis

### 6. Data Visualization

* Display historical posture data in a meaningful way (e.g., line charts, trends, comparative metrics)
* Visualization should help users understand patterns and improvement

---

## Suggested (Optional) Enhancements

Calibration system, metric breakdown, session summaries, CSV export, gamification, audio/visual alerts, multi-profile tracking, advanced smoothing.

---

## Documentation Requirements

* `README.md` with description, features, tech stack, setup, and explanation of posture analysis
* `prompt_log.txt` recording iterative prompts used during development

---

*See `posture-coach/README.md` for the delivered implementation and `posture-coach/prompt_log.txt` for the development log.*
