// Content Management JavaScript
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.2.0/firebase-app.js"
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/9.2.0/firebase-auth.js"
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  query,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/9.2.0/firebase-firestore.js"

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-rXYqdJ5ujIxWNt4PjSJh4FtDyc3hieI",
  authDomain: "codequest-2025.firebaseapp.com",
  projectId: "codequest-2025",
  storageBucket: "codequest-2025.firebasestorage.app",
  messagingSenderId: "5857953993",
  appId: "1:5857953993:web:79cc6a52b3baf9b7b52518",
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)


// DOM Elements
const loadingElement = document.getElementById("loading")
const selectChapterSub = document.getElementById("select-chap-subchap")
const emptyState = document.getElementById("empty-state")
const chapterInput = document.getElementById("chapter-input")
const chapterTitle = document.getElementById("chapter-title")
const subchapInput = document.getElementById("subchap-input")

// Question Container
const questionContainer = document.getElementById("question-container")

// Stats Elements
const totalChaptersElement = document.getElementById("total-chapters")
const totalLevelsElement = document.getElementById("total-levels")
const totalTestsElement = document.getElementById("total-tests")

// Modal Elements
const modal = document.getElementById("questionModal")
const modalTitle = document.getElementById("modal-title")
const modalQuestion = document.getElementById("modal-question")
const modalAnswer = document.getElementById("modal-answer")
const modalStatus = document.getElementById("modal-status")
const closeBtn = document.querySelector(".close-btn")


// Select Content Modal Elements
const selectContentBtn = document.getElementById("select-content-btn")
const selectContentModal = document.getElementById("select-content-modal")
const selectBtn = document.getElementById("bulk-select-btn");
const saveBtn = document.getElementById("save-btn");
const cancelBtn = document.getElementById("cancel-btn");
const archivedContainer = document.getElementById("select-arcquestion-container");
const activeContainer = document.getElementById("select-actquestion-container");

const arcloading = document.getElementById("arc-loading");
const actloading = document.getElementById("act-loading");
const arcEmpty = document.getElementById("arc-empty-state")
const actEmpty = document.getElementById("act-empty-state");

const questionType = document.getElementById("question-type");
const createdBy = document.getElementById("creator");
const sortByChapter = document.getElementById("sortByChapter");
const sortByLesson = document.getElementById("sortByLesson");

const currentCountElem = document.getElementById("current-count");
const limitInputElem = document.getElementById("limit-count");

let originalActiveIds = [];
let currentActiveIds = [];

let selectedArchivedCreator = "";
let selectedArchivedChapterID = "";
let selectedArchivedLessonID = "";
let selectedArchivedType = "";

let prefilledChapterID = "";
let prefilledLessonID = "";

let currentSelectionType = "";

// Current 
let currentUser = null
let adminProfile = null

// Check if user is authenticated
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user
      // Load admin profile first
      await loadAdminProfile()
      // User is signed in, load data
      loadStats()
      toggleSelectContentBtn();
      loadChaptersDropdown()
      setupEventListeners()
    } else {
      // User is not signed in, redirect to login page
      window.location.href = "../index.html"
    }
  })
})

// Setup event listeners
function setupEventListeners() {
  // Close modals when clicking outside
  // window.addEventListener("click", (e) => {
  //   if (e.target.classList.contains("modal")) {
  //     closeAllModals()
  //   }
  // })
}

// Close all modals
function closeAllModals() {
  const modals = document.querySelectorAll(".modal")
  modals.forEach((modal) => {
    modal.style.display = "none"
  })
}

function showActLoading() {
  actloading.style.display = "block"
}

function hideActLoading() {
  actloading.style.display = "none"
}

function showArcLoading() {
  arcloading.style.display = "block"
}

function hideArchLoading() {
  arcloading.style.display = "none"
}

function showActiveEmpty() {
  actEmpty.style.display = "block"
}

function hideActiveEmpty() {
  actEmpty.style.display = "none"
}

function showArchiveEmpty() {
  arcEmpty.style.display = "block"
}

function hideArchiveEmpty() {
  arcEmpty.style.display = "none"
}

function showLoading() {
  loadingElement.style.display = "block"
}

function hideLoading() {
  loadingElement.style.display = "none"
}

function showSelect() {
  selectChapterSub.style.display = "block"
}

function hideSelect() {
  selectChapterSub.style.display = "none"
}

function showEmptyState() {
  emptyState.style.display = "block"
}

function hideEmptyState() {
  emptyState.style.display = "none"
}

// Load admin profile from Firestore
async function loadAdminProfile() {
  try {
    if (!currentUser) return

    // Try to get admin profile from 'admins' collection
    const adminDoc = await getDoc(doc(db, "admins", currentUser.uid))

    if (adminDoc.exists()) {
      adminProfile = adminDoc.data()
    } else {
      // If no admin profile, try 'users' collection
      const userDoc = await getDoc(doc(db, "users", currentUser.uid))
      if (userDoc.exists()) {
        adminProfile = userDoc.data()
      } else {
        // Create a basic profile with email
        adminProfile = {
          name: currentUser.displayName || currentUser.email.split("@")[0],
          email: currentUser.email,
        }
      }
    }
  } catch (error) {
    console.error("Error loading admin profile:", error)
    // Fallback profile
    adminProfile = {
      name: currentUser.displayName || currentUser.email.split("@")[0],
      email: currentUser.email,
    }
  }
}

// Load statistics (for content management)
async function loadStats() {
  try {
    // (Optional) show placeholders while loading
    totalChaptersElement.textContent = "…"
    totalLevelsElement.textContent = "…"
    totalTestsElement.textContent = "…"

    let totalChapters = 0
    let totalLevels = 0
    let totalTests = 0

    const chaptersSnapshot = await getDocs(
      collection(db, "admins", currentUser.uid, "chapter-content")
    )
    totalChapters = chaptersSnapshot.size
    console.log("[stats] chapters:", totalChapters)

    await Promise.all(
      chaptersSnapshot.docs.map(async (chDoc) => {
        const chapterId = chDoc.id
        const chapterRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterId)

        // --- Lessons -> Levels ---
        const lessonsSnapshot = await getDocs(collection(chapterRef, "lessons"))
        let levelsInChapter = 0

        lessonsSnapshot.forEach((lessonDoc) => {
          const lessonData = lessonDoc.data()
          if (Array.isArray(lessonData.levels)) {
            levelsInChapter += lessonData.levels.length
          }
        })
        totalLevels += levelsInChapter

        // --- Tests (pre + post) ---
        const pretestSnapshot = await getDocs(collection(chapterRef, "preTest"))
        const posttestSnapshot = await getDocs(collection(chapterRef, "postTest"))
        totalTests += pretestSnapshot.size + posttestSnapshot.size

        console.log(
          `[stats] ${chapterId}: lessons=${lessonsSnapshot.size}, levels=${levelsInChapter}, pre=${pretestSnapshot.size}, post=${posttestSnapshot.size}`
        )
      })
    )

    // --- Update UI ---
    totalChaptersElement.textContent = totalChapters
    totalLevelsElement.textContent = totalLevels
    totalTestsElement.textContent = totalTests
  } catch (error) {
    console.error("❌ Error loading stats:", error)
    totalChaptersElement.textContent = "0"
    totalLevelsElement.textContent = "0"
    totalTestsElement.textContent = "0"
  }
}

function toggleSelectContentBtn() {
  const chapterId = chapterInput.value;
  const subchapterId = subchapInput.value;

  if (chapterId && subchapterId) {
    selectContentBtn.disabled = false;
    selectContentBtn.removeAttribute("title"); // ✅ remove tooltip when enabled
  } else {
    selectContentBtn.disabled = true;
    selectContentBtn.setAttribute("title", "Please select a chapter and subchapter first");
  }
}

subchapInput.disabled = true
subchapInput.innerHTML = `<option value="" disabled selected>-- Select a Chapter First --</option>`

async function loadChaptersDropdown() {
  showLoading();
  chapterInput.innerHTML = "";
  subchapInput.innerHTML = '<option value="" disabled selected>-- Select a Chapter First --</option>';
  subchapInput.disabled = true;

  try {
    const snapshot = await getDocs(collection(db, "admins", currentUser.uid, "chapter-content"));

    if (snapshot.empty) {
      chapterInput.innerHTML = '<option value="" disabled selected>No Chapters Found</option>';
      chapterInput.disabled = true;
      return;
    }

    chapterInput.disabled = false;

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "-- Select a Chapter --";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    chapterInput.appendChild(defaultOption);

    // Loop through each doc in chapter-content (admin-specific)
    for (const docSnap of snapshot.docs) {
      const docId = docSnap.id; // e.g. "Chapter1"
      const chapterContentData = docSnap.data();

      const chapterID = chapterContentData.chapterID; // actual Firestore ID in `chapters` collection

      let chapterTitleText = docId.replace(/([a-zA-Z]+)(\d+)/, "$1 $2"); // "Chapter1" → "Chapter 1"

      if (chapterID) {
        const chapterDoc = await getDoc(doc(db, "chapters", chapterID));
        if (chapterDoc.exists()) {
          const chapterData = chapterDoc.data();
          chapterTitleText = chapterData.chapterTitle || chapterTitleText;
        }
      }

      const option = document.createElement("option");
      option.value = docId; // Use admin-side document ID for value
      option.textContent = chapterTitleText;
      chapterInput.appendChild(option);
    }

  } catch (err) {
    console.error("Error loading chapters:", err);
  } finally {
    hideLoading();
    showSelect();
  }
}

chapterInput.addEventListener("change", (e) => {
  const chapterId = e.target.value;
  subchapInput.value = "";

  if (!chapterId) {
    subchapInput.innerHTML = '<option value="" disabled selected>-- Select a Chapter First --</option>';
    subchapInput.disabled = true;
    return;
  }

  questionContainer.innerHTML = "";
  loadSubchaptersDropdown(chapterId);
  toggleSelectContentBtn();
  hideSelect();
  hideEmptyState();
});

async function loadSubchaptersDropdown(chapterId) {
  showLoading();

  try {
    const chapterRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterId);
    const chapterSnap = await getDoc(chapterRef);

    if (!chapterSnap.exists()) throw new Error("Chapter not found");

    const chapterData = chapterSnap.data();
    chapterTitle.dataset.chapterId = chapterId;

    // ✅ Get chapter title from global chapters/{chapterID}
    if (chapterData.chapterID) {
      const globalChapterRef = doc(db, "chapters", chapterData.chapterID);
      const globalChapterSnap = await getDoc(globalChapterRef);

      chapterTitle.textContent = globalChapterSnap.exists()
        ? globalChapterSnap.data().chapterTitle || "Untitled Chapter"
        : "Chapter Title Not Found";
    } else {
      chapterTitle.textContent = "Untitled Chapter";
    }

    subchapInput.innerHTML = "";
    let hasSubchapters = false;

    const addOption = (id, title, type, parentId = null, questionId = null) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = title;
      option.dataset.type = type;
      if (parentId) option.dataset.parentId = parentId;
      if (questionId) option.dataset.questionId = questionId;
      subchapInput.appendChild(option);
      hasSubchapters = true;
    };

    // ✅ PreTest
    const preTestSnap = await getDocs(collection(chapterRef, "preTest"));
    preTestSnap.forEach((doc) => {
      const data = doc.data();
      addOption(data.preTestID || doc.id, data.preTitle || "Pre Test", "preTest");
    });

    // ✅ Lessons & Levels (Grouped Under Lessons - Get title from global chapters)
    const lessonsSnap = await getDocs(collection(chapterRef, "lessons"));

    const globalChapterId = chapterData.chapterID;
    const sortedLessons = [];

    for (const docSnap of lessonsSnap.docs) {
      const localLessonId = docSnap.id;
      const localData = docSnap.data();
      const lessonLabel = localData.lessonLabel || "Lesson";
      const customLessonId = localData.lessonID || localLessonId;

      let lessonTitle = "";

      if (globalChapterId) {
        try {
          const globalLessonRef = doc(db, "chapters", globalChapterId, "lessons", customLessonId);
          const globalLessonSnap = await getDoc(globalLessonRef);
          if (globalLessonSnap.exists()) {
            lessonTitle = globalLessonSnap.data().lessonTitle || "";
          }
          // console.log(`Looking up global lesson title for ${localLessonId} in chapter ${globalChapterId}`);
          // console.log(`Fetched global lesson title for ${localLessonId}:`, lessonTitle);
        } catch (err) {
          console.warn(`⚠️ Failed to fetch global lesson title for ${localLessonId}`, err);
        }
      }

      const levels = Array.isArray(localData.levels) ? localData.levels : [];
      sortedLessons.push({ id: localLessonId, label: lessonLabel, title: lessonTitle, levels });
    }

    // Sort by numeric part of lesson label
    sortedLessons.sort((a, b) => {
      const getLessonNumber = (label) => parseInt(label.match(/\d+/)?.[0] || 0);
      return getLessonNumber(a.label) - getLessonNumber(b.label);
    });

    // Add dropdown options
    for (const lesson of sortedLessons) {
      // if (lesson.levels.length === 0) continue;
      const baseTitle = `Levels under ${lesson.label}${lesson.title ? ` - ${lesson.title}` : ""}`;
      // ${lesson.levels.length === 0 ? " (No Levels)" : ""}
      addOption(lesson.id, baseTitle, "levels");
    }

    // ✅ PostTest
    const postTestSnap = await getDocs(collection(chapterRef, "postTest"));
    postTestSnap.forEach((doc) => {
      const data = doc.data();
      addOption(data.postTestID || doc.id, data.postTitle || "Post Test", "postTest");
    });

    if (hasSubchapters) {
      subchapInput.disabled = false;
      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "-- Select a Subchapter --";
      defaultOption.disabled = true;
      defaultOption.selected = true;
      subchapInput.insertBefore(defaultOption, subchapInput.firstChild);
    } else {
      subchapInput.innerHTML = '<option value="" disabled selected>No SubChapters Found</option>';
      subchapInput.disabled = true;
    }

  } catch (error) {
    console.error("❌ Error loading subchapters:", error);
  } finally {
    hideLoading();
    showSelect();
  }
}

subchapInput.addEventListener("change", (e) => {
  const selectedOption = e.target.selectedOptions[0]
  if (!selectedOption) return

  const subchapterId = selectedOption.value // this might now be LEVEL INDEX (not questionID)
  const type = selectedOption.dataset.type
  const parentId = selectedOption.dataset.parentId || null
  const chapterId = document.getElementById("chapter-title").dataset.chapterId

  console.log("Selected:", { chapterId, type, subchapterId, parentId })

  if (subchapterId && type && chapterId) {
    loadQuestions(chapterId, type, subchapterId, parentId)
  }

  questionContainer.innerHTML = "" // Clear old cards
  toggleSelectContentBtn();
  showLoading()
  hideSelect()
  hideEmptyState()
})

async function loadQuestions(chapterId, type, subchapterId, parentId = null) {
  try {
    hideLoading();
    hideSelect();

    questionContainer.innerHTML = ""; // Clear old cards
    let questionIDs = [];

    const chapterRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterId);

    if (type === "levels") {
      const lessonRef = doc(chapterRef, "lessons", subchapterId);
      const lessonSnap = await getDoc(lessonRef);

      if (!lessonSnap.exists()) {
        console.warn("⚠️ Lesson not found:", subchapterId);
        hideLoading();
        return;
      }

      const lessonData = lessonSnap.data();
      const levels = Array.isArray(lessonData.levels) ? lessonData.levels : [];

      if (levels.length === 0) {
        hideLoading();
        showEmptyState();
        return;
      }

      let updatedLevels = [...levels]; // clone for potential updates
      let hasChanges = false;
      let questionNumber = 1;

      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const qId = typeof level === "string" ? level : level.questionID;

        if (!qId) continue;

        const questionRef = doc(db, "questions", qId);
        const questionSnap = await getDoc(questionRef);

        if (!questionSnap.exists()) {
          console.warn(`🗑️ Missing question in 'questions': ${qId} — removing from lesson.`);
          updatedLevels = updatedLevels.filter((lvl) => {
            const id = typeof lvl === "string" ? lvl : lvl.questionID;
            return id !== qId;
          });
          hasChanges = true;
          continue;
        }

        const qData = questionSnap.data();

        let formattedQuestion = Array.isArray(qData.question)
          ? qData.question.join("\n\n")
          : qData.question || "No question text";
        formattedQuestion = formattedQuestion.replace(/@/g, "____");

        const formattedAnswer = Array.isArray(qData.answer)
          ? qData.answer.join(", ")
          : qData.answer || "No answer provided";

        const card = document.createElement("div");
        card.classList.add("question-card");
        card.style.position = "relative";

        card.innerHTML = `
          <h2 class="question-title">Level ${i + 1} : ${qData.questionID || qId}</h2>
          <br>
          <p class="question-items"><strong>Question:</strong></p>
          <pre><code>${formattedQuestion}</code></pre>
          <br>
          <hr><br>
          <p class="question-answers"><strong>Answer:</strong></p>
          <pre><code>${formattedAnswer}</code></pre>
          <span class="status-badge">${(qData.status || "unknown").toUpperCase()}</span>
        `;

        questionContainer.appendChild(card);

        const badge = card.querySelector(".status-badge");
        badge.style.position = "absolute";
        badge.style.top = "15px";
        badge.style.right = "15px";
        badge.style.fontSize = "12px";
        badge.style.fontWeight = "bold";
        badge.style.padding = "4px 8px";
        badge.style.borderRadius = "12px";
        badge.style.color = "#fff";
        badge.style.backgroundColor = badge.textContent === "ACTIVE" ? "green" : "gray";

        card.addEventListener("click", () => {
          openModal(qData.questionID, qData, qId);
        });

        questionNumber++;
      }

      if (hasChanges) {
        await updateDoc(lessonRef, {
          levels: updatedLevels,
        });
        console.log("✅ Cleaned up invalid levels and updated Firestore.");
      }

      if (questionNumber === 1) {
        showEmptyState();
      }

      if (updatedLevels.length === 0) {
        showEmptyState();
      }

      hideLoading();
      return;
    }

    // PreTest / PostTest
    else if (type === "preTest" || type === "postTest") {
      const subDocRef = doc(chapterRef, type, subchapterId);
      const subDocSnap = await getDoc(subDocRef);

      if (subDocSnap.exists()) {
        const subData = subDocSnap.data();
        if (Array.isArray(subData.items)) {
          questionIDs = [...subData.items];
        }

        let updatedItems = [...questionIDs];
        let hasChanges = false;
        let questionNumber = 1;

        for (const qId of questionIDs) {
          if (!qId) continue;
          const questionRef = doc(db, "questions", qId);
          const questionSnap = await getDoc(questionRef);

          if (!questionSnap.exists()) {
            console.warn(`🗑️ Missing question in 'questions': ${qId} — removing from test.`);
            updatedItems = updatedItems.filter((id) => id !== qId);
            hasChanges = true;
            continue;
          }

          const qData = questionSnap.data();

          let formattedQuestion = Array.isArray(qData.question)
            ? qData.question.join("\n\n")
            : qData.question || "No question text";
          formattedQuestion = formattedQuestion.replace(/@/g, "____");

          const formattedAnswer = Array.isArray(qData.answer)
            ? qData.answer.join(", ")
            : qData.answer || "No answer provided";

          const card = document.createElement("div");
          card.classList.add("question-card");
          card.style.position = "relative";

          card.innerHTML = `
            <h2 class="question-title">Question ${questionNumber} : ${qData.questionID || qId}</h2>
            <br>
            <p class="question-items"><strong>Question:</strong></p>
            <pre><code>${formattedQuestion}</code></pre>
            <br>
            <hr><br>
            <p class="question-answers"><strong>Answer:</strong></p>
            <pre><code>${formattedAnswer}</code></pre>
            <span class="status-badge">${(qData.status || "unknown").toUpperCase()}</span>
          `;

          questionContainer.appendChild(card);

          const badge = card.querySelector(".status-badge");
          badge.style.position = "absolute";
          badge.style.top = "15px";
          badge.style.right = "15px";
          badge.style.fontSize = "12px";
          badge.style.fontWeight = "bold";
          badge.style.padding = "4px 8px";
          badge.style.borderRadius = "12px";
          badge.style.color = "#fff";
          badge.style.backgroundColor = badge.textContent === "ACTIVE" ? "green" : "gray";

          card.addEventListener("click", () => {
            openModal(qData.questionID, qData, qId);
          });

          questionNumber++;
        }

        if (hasChanges) {
          await updateDoc(subDocRef, {
            items: updatedItems,
          });
          console.log("✅ Cleaned up invalid test items and updated Firestore.");
        }

        if (questionNumber === 1) {
          showEmptyState();
        }

        if (updatedItems.length === 0) {
          showEmptyState();
        }

        hideLoading();
        hideSelect();
        return;
      }
    }

    // If no questions were found
    // questionContainer.innerHTML = "<p>No questions found.</p>";
    showEmptyState();
    hideLoading();
    hideSelect();

  } catch (error) {
    console.error("Error loading questions:", error);
    hideLoading();
  }
}


function formatQuestionType(type) {
  switch (type) {
    case "multipleChoice": return "Multiple Choice"
    case "trueOrFalse": return "True or False"
    case "matchingType": return "Matching Type"
    case "debugging": return "Debugging"
    default: return "Unknown Type"
  }
}

async function openModal(questionNumber, qData, docId) {
  const modalQuestionType = document.getElementById("modal-question-type");
  const modalQuestion = document.getElementById("modal-question");
  const modalChoices = document.getElementById("modal-choices");
  const modalInstruction = document.getElementById("modal-instruction");
  const answerdiv = document.querySelector(".modal-answer-div");
  const matchlbl = document.getElementById("modal-matching-label");
  const modalMatchingPairs = document.getElementById("modal-matching-pairs");

  modalTitle.textContent = `Question ${questionNumber}`;

  let formattedQuestion = Array.isArray(qData.question)
    ? qData.question.join("\n\n")
    : qData.question || "No question text";
  formattedQuestion = formattedQuestion.replace(/@/g, '____');

  modalQuestion.innerHTML = `<strong>Question:</strong><pre><code>${formattedQuestion}</code></pre>`;

  modalInstruction.innerHTML = `<strong>Instruction:</strong> ${qData.instruction || "No instruction provided"}`;

  const typeFormatted = formatQuestionType(qData.questionType);
  modalQuestionType.innerHTML = `<strong>Type: </strong>${typeFormatted}`;

  modalQuestion.style.textAlign = "center";
  modalQuestion.style.display = "block";
  answerdiv.style.display = "block";
  modalChoices.style.display = "grid";
  modalMatchingPairs.style.display = "none";
  matchlbl.style.display = "none";

  if (qData.questionType === "multipleChoice" || qData.questionType === "debugging") {
    try {
      modalQuestion.style.textAlign = qData.questionType === "debugging" ? "left" : "center";

      const mcRef = doc(db, "questions", docId);
      const mcSnap = await getDoc(mcRef);

      if (mcSnap.exists()) {
        const mcData = mcSnap.data();
        const choices = mcData.choices || [];

        modalChoices.innerHTML = ''; // Clear previous inputs if any
        modalQuestion.innerHTML += `<br><div style="text-align: center;"><strong>Choices:</strong></div>`;

        if (choices.length > 0) {
          choices.forEach((choice, index) => {
            const input = document.createElement("input");
            input.type = "text";
            input.id = `modal-choice${index + 1}`;
            input.name = `modal-choice${index + 1}`;
            input.classList.add("form-control");
            input.readOnly = true;
            input.value = choice;

            modalChoices.appendChild(input);
          });
        } else {
          console.warn(" No choices found in Firestore");
        }
      } else {
        console.warn(" Multiple choice doc not found");
      }
    } catch (err) {
      console.error(" Error fetching choices:", err);
    }
  }
  else if (qData.questionType === "trueOrFalse") {
    modalChoices.style.display = "none";
  }
  else if (qData.questionType === "matchingType") {
    try {
      modalQuestion.style.display = "none";
      modalChoices.style.display = "none";
      answerdiv.style.display = "none";
      matchlbl.style.display = "block";
      modalMatchingPairs.style.display = "block";

      const matchRef = doc(db, "questions", docId);
      const matchSnap = await getDoc(matchRef);

      modalMatchingPairs.innerHTML = '';

      if (matchSnap.exists()) {
        const matchData = matchSnap.data();

        const question = matchData.question || [];
        const answer = matchData.answer || [];

        matchlbl.innerHTML = `<br><div style="text-align: center;"><strong>Matching Pairs:</strong></div>`;

        if (question.length === answer.length && question.length > 0) {
          for (let i = 0; i < question.length; i++) {
            const div = document.createElement("div");
            div.classList.add("modal-matching-pair");

            div.innerHTML = `
              <div class="matching-input-wrapper">
                <textarea class="matching-input" readonly>${question[i]}</textarea>
              </div>
              <div class="matching-input-wrapper">
                <textarea class="matching-input" readonly>${answer[i]}</textarea>
              </div>
            `;

            modalMatchingPairs.appendChild(div);
          }
        } else {
          console.warn(" Mismatched or empty questions/answers arrays in Firestore");
          modalMatchingPairs.innerHTML = `<p style="color: red;">Invalid or missing matching data</p>`;
        }

        matchlbl.style.display = "block";

      } else {
        console.warn(" Matching question doc not found");
      }

    } catch (err) {
      console.error(" Error fetching matching question:", err);
    }
  }

  // Format answer for display
  const formattedAnswer = Array.isArray(qData.answer)
    ? qData.answer.join(", ")
    : qData.answer || "No answer provided";

  modalAnswer.innerHTML = `<strong>Answer:</strong> ${formattedAnswer}`;

  modalStatus.textContent = (qData.status || "Unknown").toUpperCase();
  modalStatus.style.backgroundColor = qData.status === "active" ? "green" : "gray";

  modal.style.display = "block";
}

// Close modal
closeBtn.onclick = () => (modal.style.display = "none")

async function openSelectContentModal() {
  selectContentModal.style.display = "block";
  resetFilter();

  selectBtn.disabled = true;
  showActLoading();
  showArcLoading();

  try {
    const chapterId = document.getElementById("chapter-input").value;
    const subchapInput = document.getElementById("subchap-input");
    const subchapterId = subchapInput.value;
    const type = subchapInput.options[subchapInput.selectedIndex]?.dataset.type || "levels";
    currentSelectionType = type;

    console.log("Chapter ID: ", chapterId);
    console.log("SubChapter ID: ", subchapterId);
    console.log("Type: ", type);

    prefilledChapterID = chapterId;
    prefilledLessonID = "";

    // Load active first to get IDs
    const activeIds = await loadActiveQuestions(chapterId, type, subchapterId);

    currentCountElem.textContent = activeIds.length;

    loadCreatorsForFilter();

    // Prefill chapter
    await loadSortByChapter();
    sortByChapter.value = chapterId;
    selectedArchivedChapterID = chapterId;

    if (type === "levels") {
      limitInputElem.value = Math.max(activeIds.length, parseInt(limitInputElem.value) || 5);
      await loadSortByLesson(chapterId);
      const lessonSnap = await getDoc(doc(db, "admins", currentUser.uid, "chapter-content", chapterId, "lessons", subchapterId));
      if (lessonSnap.exists()) {
        const lessonLabel = lessonSnap.data().lessonLabel;
        if (lessonLabel) {
          sortByLesson.disabled = false;
          sortByLesson.value = lessonLabel;
          selectedArchivedLessonID = lessonLabel;
          prefilledLessonID = lessonLabel; // store lesson for reset
        }
      }
    } else {
      limitInputElem.value = Math.max(activeIds.length, parseInt(limitInputElem.value) || 10);
      await loadSortByLesson(chapterId);
      sortByLesson.disabled = false;
      selectedArchivedLessonID = "";
      prefilledLessonID = "";
    }

    await loadArchivedQuestions(activeIds);

    hideActLoading();
    hideArchLoading();

  } catch (err) {
    console.error("❌ Failed to load questions in modal:", err);
  } finally {
    selectBtn.disabled = false;
    hideActLoading();
    hideArchLoading();
  }

  hideActLoading();
  hideArchLoading();

  selectBtn.style.display = "inline-block";
  saveBtn.style.display = "none";
  cancelBtn.style.display = "none";
}

async function closeSelectContentModal() {
  selectContentModal.style.display = "none"

  selectBtn.style.display = "inline-block";
  saveBtn.style.display = "none";
  cancelBtn.style.display = "none";

  hideActiveEmpty();
  hideArchiveEmpty();
  hideActLoading();
  hideArchLoading();
}

async function loadArchivedQuestions(activeIds = []) {
  currentActiveIds = activeIds; // store globally for reuse
  try {
    const container = document.querySelector(".archived-questions-div #select-arcquestion-container");
    const counterElem = document.getElementById("archived-counter"); // ✅ make sure you have this in HTML
    hideArchiveEmpty();
    showArcLoading();

    let baseRef = collection(db, "questions"); // adjust if you have a dedicated "archived-questions"
    let constraints = [];

    // 🔍 Apply Firestore filters dynamically
    if (selectedArchivedType) {
      constraints.push(where("questionType", "==", selectedArchivedType));
    }
    if (selectedArchivedCreator) {
      constraints.push(where("createdBy", "==", selectedArchivedCreator));
    }
    if (selectedArchivedChapterID) {
      constraints.push(where("underChapter", "==", selectedArchivedChapterID));
    }
    if (selectedArchivedLessonID) {
      constraints.push(where("underLesson", "==", selectedArchivedLessonID));
    }

    // Build query
    const q = constraints.length > 0 ? query(baseRef, ...constraints) : baseRef;

    const qSnap = await getDocs(q);
    container.innerHTML = "";

    let count = 0;

    qSnap.forEach((docSnap) => {
      if (currentActiveIds.includes(docSnap.id)) return; // ✅ Exclude active ones
      const qData = docSnap.data();
      count++;

      let formattedQuestion = Array.isArray(qData.question)
        ? qData.question.join("\n\n")
        : qData.question || "No question text";

      let formattedAnswer = Array.isArray(qData.answer)
        ? qData.answer.join(", ")
        : qData.answer || "No answer provided";

      const card = document.createElement("div");
      card.classList.add("question-card");
      card.innerHTML = `
        <input type="checkbox" class="archived-checkbox" value="${docSnap.id}" style="display:none;">
        <h3 class="question-title">${qData.questionID || docSnap.id}</h3>
        <p class="question-types"><strong>Type:</strong> ${qData.questionType}</p>
        <br>
        <p class="question-items"><strong>Question:</strong></p>
        <pre><code>${formattedQuestion}</code></pre>
        <br><hr><br>
        <p class="question-answers"><strong>Answer:</strong></p>
        <pre><code>${formattedAnswer}</code></pre>
      `;

      container.appendChild(card);
    });

    if (counterElem) {
      counterElem.textContent = `(${count})`;
    }

    if (count === 0) {
      showArchiveEmpty();
    }

    // if (!container.hasChildNodes()) {
    //   showArchiveEmpty();
    // }

    hideArchLoading();
  } catch (err) {
    console.error("❌ Error loading archived questions:", err);
    hideArchLoading();
  }
}

async function loadActiveQuestions(chapterId, type, subchapterId) {
  try {
    const container = document.querySelector(".active-questions-div #select-actquestion-container");
    // hideActiveEmpty();
    showActLoading();

    let questionIDs = [];
    const chapterRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterId);

    if (type === "levels") {
      const lessonRef = doc(chapterRef, "lessons", subchapterId);
      const lessonSnap = await getDoc(lessonRef);
      if (lessonSnap.exists()) {
        const levels = Array.isArray(lessonSnap.data().levels) ? lessonSnap.data().levels : [];
        questionIDs = levels.map((lvl) => (typeof lvl === "string" ? lvl : lvl.questionID));
      }
    } else if (type === "preTest" || type === "postTest") {
      const subDocRef = doc(chapterRef, type, subchapterId);
      const subDocSnap = await getDoc(subDocRef);
      if (subDocSnap.exists()) {
        questionIDs = Array.isArray(subDocSnap.data().items) ? subDocSnap.data().items : [];
      }
    }

    container.innerHTML = "";

    for (const qId of questionIDs) {
      if (!qId) continue;
      const qSnap = await getDoc(doc(db, "questions", qId));
      if (!qSnap.exists()) continue;

      const qData = qSnap.data();
      let formattedQuestion = Array.isArray(qData.question)
        ? qData.question.join("\n\n")
        : qData.question || "No question text";

      let formattedAnswer = Array.isArray(qData.answer)
        ? qData.answer.join(", ")
        : qData.answer || "No answer provided";

      const card = document.createElement("div");
      card.classList.add("question-card");
      card.innerHTML = `
        <input type="checkbox" class="active-checkbox" value="${qId}" style="display:none;">
        <h3 class="question-title">${qData.questionID || qId}</h3>
        <p class="question-types"><strong>Type:</strong> ${qData.questionType}</p>
        <br>
        <p class="question-items"><strong>Question:</strong></p>
        <pre><code>${formattedQuestion}</code></pre>
        <br><hr><br>
        <p class="question-answers"><strong>Answer:</strong></p>
        <pre><code>${formattedAnswer}</code></pre>
      `;

      container.appendChild(card);
    }

    if (!container.hasChildNodes()) {
      showActiveEmpty();
    }

    hideActLoading();
    return questionIDs; // ✅ return to exclude them in archive
  } catch (err) {
    console.error("❌ Error loading active questions:", err);
    hideActLoading();
    return [];
  }
}

function updateSelectionCounter(contextType = currentSelectionType) {
  const limitTextElem = document.getElementById("limit-text");
  const saveBtn = document.getElementById("save-btn");

  // when the input is hidden we read the locked value from the span
  const limit = parseInt(
    (limitInputElem.style.display === "none" ? limitTextElem.textContent : limitInputElem.value)
  ) || 10;

  const active = document.querySelectorAll(".active-checkbox:checked").length;
  const archived = document.querySelectorAll(".archived-checkbox:checked").length;
  const totalSelected = active + archived;

  currentCountElem.textContent = totalSelected;

  const isTest = (contextType === "preTest" || contextType === "postTest");

  // Only tests hard-stop new checks once limit is reached
  document.querySelectorAll(".archived-checkbox:not(:checked)").forEach(cb => {
    cb.disabled = isTest && totalSelected >= limit;
  });
  document.querySelectorAll(".active-checkbox:not(:checked)").forEach(cb => {
    cb.disabled = isTest && totalSelected >= limit;
  });

  // Red if user exceeds limit (any mode)
  currentCountElem.style.color = (totalSelected > limit) ? "red" : "";

  // Enable/disable Save
  if (isTest) {
    // must be exact for pre/post tests
    const ok = (totalSelected === limit);
    saveBtn.disabled = !ok;
    saveBtn.title = ok ? "" : `Please select exactly ${limit} questions to continue.`;
  } else {
    // levels: allow <= limit, but not zero
    const ok = (totalSelected > 0 && totalSelected <= limit);
    saveBtn.disabled = !ok;
    saveBtn.title = ok ? "" : `Please select up to ${limit} questions to continue.`;
  }
}

const handleSelectionChange = () => updateSelectionCounter();

selectBtn.addEventListener("click", async () => {
  const activeChecks = document.querySelectorAll(".active-checkbox");
  const archivedChecks = document.querySelectorAll(".archived-checkbox");

  originalActiveIds = [...activeChecks].map(cb => cb.value);

  activeChecks.forEach(cb => {
    cb.style.display = "inline-block";
    cb.checked = true;
    cb.addEventListener("change", handleSelectionChange);
  });

  archivedChecks.forEach(cb => {
    cb.style.display = "inline-block";
    cb.checked = false;
    cb.addEventListener("change", handleSelectionChange);
  });

  // lock the limit UI
  const limitInputElem = document.getElementById("limit-count");
  const limitTextElem = document.getElementById("limit-text");
  const limitValue = parseInt(limitInputElem.value) || 10;

  limitTextElem.textContent = limitValue;
  limitInputElem.style.display = "none";
  limitTextElem.style.display = "inline-block";

  // 👇 This no longer throws, and uses the remembered type
  updateSelectionCounter();

  // show save/cancel
  selectBtn.style.display = "none";
  saveBtn.style.display = "inline-block";
  cancelBtn.style.display = "inline-block";
});

cancelBtn.addEventListener("click", () => {
  const activeChecks = document.querySelectorAll(".active-checkbox");
  const archivedChecks = document.querySelectorAll(".archived-checkbox");

  activeChecks.forEach(cb => {
    cb.style.display = "none";
    cb.checked = originalActiveIds.includes(cb.value);
    cb.removeEventListener("change", handleSelectionChange);
  });

  archivedChecks.forEach(cb => {
    cb.style.display = "none";
    cb.checked = false;
    cb.removeEventListener("change", handleSelectionChange);
  });

  // unlock limit UI
  document.getElementById("limit-count").style.display = "inline-block";
  document.getElementById("limit-text").style.display = "none";

  updateSelectionCounter();

  selectBtn.style.display = "inline-block";
  saveBtn.style.display = "none";
  cancelBtn.style.display = "none";
});

saveBtn.addEventListener("click", async () => {
  try {
    const activeContainer = document.querySelector(".active-questions-div #select-actquestion-container");
    const archivedContainer = document.querySelector(".archived-questions-div #select-arcquestion-container");

    let newActiveIds = [];

    // ✅ Preserve order: go through ACTIVE container first
    activeContainer.querySelectorAll("input[type=checkbox]").forEach(cb => {
      if (cb.checked) {
        newActiveIds.push(cb.value); // keep active ones
      } else {
        // If unchecked, look for replacement in archived
        const replacement = archivedContainer.querySelector(`input[type=checkbox][value="${cb.value}"]:checked`);
        if (replacement) {
          newActiveIds.push(replacement.value); // insert at the same position
        }
      }
    });

    // ✅ Add remaining archived ones (if newly selected, not replacement)
    archivedContainer.querySelectorAll("input[type=checkbox]").forEach(cb => {
      if (cb.checked && !newActiveIds.includes(cb.value)) {
        newActiveIds.push(cb.value);
      }
    });

    // Save back to Firestore (chapter-content structure)
    const chapterId = document.getElementById("chapter-input").value;
    const subchapInput = document.getElementById("subchap-input");
    const subchapterId = subchapInput.value;
    const type = subchapInput.options[subchapInput.selectedIndex]?.dataset.type || "levels";

    const chapterRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterId);

    let targetDocRef;
    if (type === "levels") {
      targetDocRef = doc(chapterRef, "lessons", subchapterId);
      await updateDoc(targetDocRef, { levels: newActiveIds });
    } else if (type === "preTest" || type === "postTest") {
      targetDocRef = doc(chapterRef, type, subchapterId);
      await updateDoc(targetDocRef, { items: newActiveIds });
    }

    // ✅ Update global "questions" collection
    const targetDocId = subchapterId; // we’ll use this as identifier in `activeOn`
    const questionIds = [...newActiveIds]; // newly active
    const allCheckboxes = [...activeContainer.querySelectorAll("input[type=checkbox]"),
    ...archivedContainer.querySelectorAll("input[type=checkbox]")];
    const allIds = allCheckboxes.map(cb => cb.value);

    for (let qId of allIds) {
      const qRef = doc(db, "questions", qId);

      if (questionIds.includes(qId)) {
        // Set status active + add current test/level ref
        await updateDoc(qRef, {
          status: "active",
          activeOn: arrayUnion(targetDocId)
        });
      } else {
        // Remove this docId from activeOn
        await updateDoc(qRef, {
          activeOn: arrayRemove(targetDocId)
        });

        // Now check if it's still active somewhere else
        const qSnap = await getDoc(qRef);
        if (qSnap.exists()) {
          const qData = qSnap.data();
          if (!qData.activeOn || qData.activeOn.length === 0) {
            await updateDoc(qRef, { status: "archived" });
          }
        }
      }
    }

    // ✅ Reload UI
    const activeIds = await loadActiveQuestions(chapterId, type, subchapterId);
    await loadArchivedQuestions(activeIds);

    // Reset buttons
    selectBtn.style.display = "inline-block";
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";


    // ✅ Restore editable input
    document.getElementById("limit-count").style.display = "inline-block";
    document.getElementById("limit-text").style.display = "none";

    showAlert("Active questions updated!", "success");
  } catch (err) {
    console.error("❌ Error saving active questions:", err);
    showAlert("Failed to save changes.", "error");
  }
});

// FILTERING FUNCTION FOR ARCHIVED QUESTIONS

async function loadCreatorsForFilter() {
  createdBy.innerHTML = `<option value="">-- All Admin --</option>`;

  try {
    const snapshot = await getDocs(collection(db, "admins"));
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const adminUID = docSnap.id;
      if (data.role === "Admin") {
        const name = data.name || "Unnamed Admin";
        const option = document.createElement("option");
        option.value = adminUID;
        option.textContent = name;
        createdBy.appendChild(option);
      }
    });
  } catch (err) {
    console.error("❌ Error loading creators:", err);
  }
}

async function loadSortByChapter() {
  sortByChapter.innerHTML = "";

  try {
    const snapshot = await getDocs(
      collection(db, "admins", currentUser.uid, "chapter-content")
    );

    if (snapshot.empty) {
      const option = document.createElement("option");
      option.textContent = "No Chapters Found";
      option.disabled = true;
      option.selected = true;
      sortByChapter.appendChild(option);
      sortByChapter.disabled = true;
      return;
    }

    sortByChapter.disabled = false;
    sortByChapter.appendChild(new Option("-- All Chapter --", ""));

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const chapterID = docSnap.id;
      const globalID = data.chapterID;

      let chapterTitle = `Chapter ${chapterID}`;
      if (globalID) {
        const globalSnap = await getDoc(doc(db, "chapters", globalID));
        if (globalSnap.exists()) {
          chapterTitle = globalSnap.data().chapterTitle || chapterTitle;
        }
      }

      const option = document.createElement("option");
      option.value = chapterID;
      option.textContent = chapterTitle;
      sortByChapter.appendChild(option);
    }
  } catch (err) {
    console.error("❌ Error loading chapters:", err);
  }
}

async function loadSortByLesson(chapterID) {
  sortByLesson.innerHTML = "";
  // sortByLesson.disabled = true;

  if (!chapterID) {
    sortByLesson.appendChild(new Option("-- All Lesson --", ""));
    return;
  }

  try {
    const chapterRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterID);
    const chapterSnap = await getDoc(chapterRef);

    if (!chapterSnap.exists()) return;

    const chapterData = chapterSnap.data();
    const globalChapterId = chapterData.chapterID;

    const lessonsRef = collection(chapterRef, "lessons");
    const lessonsSnap = await getDocs(lessonsRef);

    if (lessonsSnap.empty) {
      sortByLesson.appendChild(new Option("No Lessons Found", "none"));
      return;
    }

    sortByLesson.disabled = false;
    sortByLesson.appendChild(new Option("-- All Lesson --", ""));

    for (const docSnap of lessonsSnap.docs) {
      const localLessonId = docSnap.id;
      const localData = docSnap.data();

      const customLessonId = localData.lessonID || localLessonId;
      const lessonLabel = localData.lessonLabel || `Lesson ${localLessonId}`;

      let lessonTitle = lessonLabel;
      if (globalChapterId && customLessonId) {
        try {
          const globalLessonRef = doc(db, "chapters", globalChapterId, "lessons", customLessonId);
          const globalLessonSnap = await getDoc(globalLessonRef);
          if (globalLessonSnap.exists()) {
            lessonTitle = globalLessonSnap.data().lessonTitle || lessonLabel;
          }
        } catch (err) {
          console.warn("⚠️ Global lesson not found:", err);
        }
      }

      const option = document.createElement("option");
      option.value = lessonLabel; // or use customLessonId if preferred
      option.textContent = lessonTitle;
      sortByLesson.appendChild(option);
    }
  } catch (err) {
    console.error("❌ Error loading lessons:", err);
  }
}

createdBy.addEventListener("change", (e) => {
  selectedArchivedCreator = e.target.value;
  loadArchivedQuestions(currentActiveIds);
});

sortByChapter.addEventListener("change", async (e) => {
  const selectedChapter = e.target.value;

  if (!selectedChapter) {
    // If "All Chapters" → disable lessons
    sortByLesson.disabled = true;
    sortByLesson.innerHTML = `<option value="">-- All Lessons --</option>`;
    selectedArchivedLessonID = "";
  } else {
    // A real chapter → enable lessons
    sortByLesson.disabled = false;
    await loadSortByLesson(selectedChapter);
  }

  selectedArchivedChapterID = selectedChapter;
  loadArchivedQuestions(currentActiveIds);
});

sortByLesson.addEventListener("change", (e) => {
  selectedArchivedLessonID = e.target.value;
  loadArchivedQuestions(currentActiveIds);
});

questionType.addEventListener("change", (e) => {
  selectedArchivedType = e.target.value;
  loadArchivedQuestions(currentActiveIds);
});

async function resetFilter() {
  selectedArchivedCreator = "";
  selectedArchivedType = "";

  // restore prefilled values
  selectedArchivedChapterID = prefilledChapterID;
  selectedArchivedLessonID = prefilledLessonID;

  questionType.value = "";
  createdBy.value = "";

  sortByChapter.value = prefilledChapterID || "";

  if (prefilledChapterID) {
    await loadSortByLesson(prefilledChapterID);
    sortByLesson.disabled = false;
    sortByLesson.value = prefilledLessonID || "";
  } else {
    sortByLesson.disabled = false;
    sortByLesson.innerHTML = `<option value="">-- All Lesson --</option>`;
  }

  hideArchiveEmpty();
  hideActiveEmpty();
  loadArchivedQuestions(currentActiveIds);
}

// async function refreshContentData() {
//     await loadStats();

//     showAlert("Data refreshed successfully!", "success");
//}

function showAlert(message, type) {
  const alertElement = document.getElementById("alert")
  const alertMessage = document.getElementById("alert-message")

  alertElement.className = "alert " + type
  alertMessage.textContent = message
  alertElement.style.display = "flex"

  setTimeout(() => {
    closeAlert()
  }, 5000)
}

function closeAlert() {
  const alertElement = document.getElementById("alert")
  alertElement.style.display = "none"
}

window.openSelectContentModal = openSelectContentModal
window.closeSelectContentModal = closeSelectContentModal
window.resetFilter = resetFilter

if (typeof window !== "undefined") {
  // Ensure DOM is loaded before attaching functions
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachGlobalFunctions)
  } else {
    attachGlobalFunctions()
  }
}

function attachGlobalFunctions() {
  window.openSelectContentModal = openSelectContentModal
  window.closeSelectContentModal = closeSelectContentModal
  window.resetFilter = resetFilter
}