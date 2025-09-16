// Question Management JavaScript
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
    setDoc,
    addDoc,
    updateDoc,
    serverTimestamp,
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
const emptyState = document.getElementById("empty-state")
const searchBar = document.getElementById("search-bar")
const questionType = document.getElementById("question-type")

// Stats Elements
const totalActiveElement = document.getElementById("active-questions")
const totalArchivedElement = document.getElementById("archived-questions")
const totalQuestionsElement = document.getElementById("total-questions")

// Container
const answerContainer = document.getElementById("answer-text-form")
const questionContainer = document.getElementById("question-container")
const contentContainer = document.getElementById("content-container")

// View Question Modal
const modal = document.getElementById("questionModal")
const modalTitle = document.getElementById("modal-title")
const modalQuestion = document.getElementById("modal-question")
const modalAnswer = document.getElementById("modal-answer")
const modalStatus = document.getElementById("modal-status")
const closeBtn = document.querySelector(".close-btn")
const editBtn = document.getElementById("edit-question-btn")
const editContainer = document.getElementById("edit-btn-container")

// Add Question Modal
const addQuestionModal = document.getElementById("add-question-modal")
const instructionFieldGroup = document.getElementById("instruction-field-group")
const instructionField = document.getElementById("instruction-field")

// Edit Modal elements
const editQuestionModal = document.getElementById("edit-question-modal")
const editDocId = document.getElementById("edit-doc-id")
const editQuestionId = document.getElementById("edit-question-id")
const editUnderChapter = document.getElementById("edit-under-chapter")
const editUnderLesson = document.getElementById("edit-under-lesson")
const editQuestionType = document.getElementById("edit-question-type")
const editInstructionField = document.getElementById("edit-instruction-field")
const editQuestionForm = document.getElementById("edit-question-text-form")
const editQuestionText = document.getElementById("edit-question-text")
const editAnswerForm = document.getElementById("edit-answer-text-form")
const editQuestionAnswer = document.getElementById("edit-question-answer")
const editChoicesSection = document.getElementById("edit-choices-section")
const editChoice1 = document.getElementById("edit-choice1")
const editChoice2 = document.getElementById("edit-choice2")
const editChoice3 = document.getElementById("edit-choice3")
const editChoice4 = document.getElementById("edit-choice4")
const editMatchingSection = document.getElementById("edit-matching-section")
const editMatchingPairs = document.getElementById("edit-matching-pairs")
const editDragdropSection = document.getElementById("edit-dragdrop-section")
const editDragdropStatement = document.getElementById("edit-dragdrop-statement")
const editDragdropAnswers = document.getElementById("edit-dragdrop-answers")
const editDragdropChoices = document.getElementById("edit-dragdrop-choices")
const editDragdropComplete = document.getElementById("edit-dragdrop-complete")
const editCreatedBy = document.getElementById("edit-created-by")
const editAdminPassword = document.getElementById("edit-admin-password")

let currentQuestionData = null;


// For Filtering
let selectedChapterID = ""
let selectedLessonID = ""
let selectedAdminUID = ""
let selectedQuestionType = ""
let currentSearchTerm = ""

// For Admin Password Preference
let adminPasswordPreference = sessionStorage.getItem("adminPasswordPreference")
    || null;

// Current 
let currentUser = null
let adminProfile = null

// Check if user is authenticated
document.addEventListener("DOMContentLoaded", () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadAdminProfile();

            // Only check sessionStorage — not localStorage
            const savedPref = sessionStorage.getItem("adminPasswordPreference");
            console.log("Saved Pref: ", savedPref);
            if (savedPref != null) {
                adminPasswordPreference = savedPref;
                document.getElementById("require-admin-password").style.display = "none";
            } else {
                // No preference for this session — show the modal
                document.getElementById("require-admin-password").style.display = "block";
            }

            loadStats();
            loadQuestions();
            loadChaptersForFilter();
            loadSortByAdmin();
            setupEventListeners();
        } else {
            window.location.href = "../index.html";
        }
    });
})

// Setup event listeners
function setupEventListeners() {
    // Close modals when clicking outside
    // window.addEventListener("click", (e) => {
    //     if (e.target.classList.contains("modal")) {
    //         closeAllModals()
    //     }
    // })
}

// Close all modals
// function closeAllModals() {
//     const modals = document.querySelectorAll(".modal")
//     modals.forEach((modal) => {
//         modal.style.display = "none"
//     })
// }

// Show loading state
function showLoading() {
    loadingElement.style.display = "block"
}

// Hide loading state
function hideLoading() {
    loadingElement.style.display = "none"
}

function showEmptyState() {
    emptyState.style.display = "block"
    contentContainer.style.display = "none"
}

function hideEmptyState() {
    emptyState.style.display = "none"
    contentContainer.style.display = "flex"
}

async function verifyAndSetPreference(pref) {
    const passwordInput = document.getElementById("admin-password-preference");
    const password = passwordInput.value.trim();

    if (!password) {
        showAlert("Please enter your admin password.", "warning");
        return;
    }

    // 🔹 Verify password before applying preference
    const isValid = await verifyAdminPassword(password);

    if (!isValid) {
        showAlert("Incorrect admin password.", "error");
        return;
    }

    // 🔹 Save preference to sessionStorage
    sessionStorage.setItem("adminPasswordPreference", pref);
    adminPasswordPreference = pref;

    document.getElementById("require-admin-password").style.display = "none";
    showAlert(
        pref === "always"
            ? "Password preference set to 'Always Ask'."
            : "Password preference set to 'Ask Once'.",
        "success"
    );
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

async function loadStats() {
    try {
        // Show placeholders
        totalActiveElement.textContent = "…"
        totalArchivedElement.textContent = "…"
        totalQuestionsElement.textContent = "…"

        // Retrieve all questions
        const questionsSnapshot = await getDocs(collection(db, "questions"))
        const totalQuestions = questionsSnapshot.size

        let activeCount = 0
        let archivedCount = 0

        questionsSnapshot.forEach((doc) => {
            const data = doc.data()
            if (data.status === "active") {
                activeCount++
            } else if (data.status === "archived") {
                archivedCount++
            }
        })

        // Update UI
        totalQuestionsElement.textContent = totalQuestions
        totalActiveElement.textContent = activeCount
        totalArchivedElement.textContent = archivedCount

        console.log(`[stats] total=${totalQuestions}, active=${activeCount}, archived=${archivedCount}`)
    } catch (error) {
        console.error("Error loading stats:", error)
        totalArchivedElement.textContent = "0"
        totalActiveElement.textContent = "0"
        totalQuestionsElement.textContent = "0"
    }
}

async function loadQuestions() {
    try {

        showLoading()

        questionContainer.innerHTML = "" // Clear old cards

        const questionsSnapshot = await getDocs(collection(db, "questions"))

        if (questionsSnapshot.empty) {
            hideLoading()
            showEmptyState()
            return
        }

        for (const docSnap of questionsSnapshot.docs) {
            const qData = docSnap.data()

            const status = qData.status || "unknown"

            let formattedQuestion = Array.isArray(qData.question)
                ? qData.question.join("\n\n")
                : qData.question || "No question text";

            formattedQuestion = formattedQuestion.replace(/@/g, '____');

            const formattedAnswer = Array.isArray(qData.answer)
                ? qData.answer.join(", ")
                : qData.answer || "No answer provided";

            const card = document.createElement("div")
            card.classList.add("question-card")
            card.style.position = "relative"

            const questionID = qData.questionID || docSnap.id;

            card.innerHTML = `
                <h2 class="question-title">Question ${questionID}</h2>
                <br>
                <p class="question-items"><strong>Question:</strong></p>
                <pre><code>${formattedQuestion}</code></pre>
                <br>
                <hr><br>
                <p class="question-answers"><strong>Answer:</strong></p>
                <pre><code>${formattedAnswer}</code></pre>
                <span class="status-badge">${status.toUpperCase()}</span>
            `

            questionContainer.appendChild(card)
            card.addEventListener("click", () => {
                openModal(questionID, qData, docSnap.id)
            })
        }

        // Apply styling for status badge
        const badges = document.querySelectorAll(".status-badge")
        badges.forEach(badge => {
            badge.style.position = "absolute"
            badge.style.top = "15px"
            badge.style.right = "15px"
            badge.style.fontSize = "12px"
            badge.style.fontWeight = "bold"
            badge.style.padding = "4px 8px"
            badge.style.borderRadius = "12px"
            badge.style.color = "#fff"
            badge.style.backgroundColor = badge.textContent === "ACTIVE" ? "green" : "gray"
        })

        hideEmptyState()
        hideLoading()

    } catch (error) {
        console.error(" Error loading questions:", error)
    }
}

async function loadSortByAdmin() {
    try {
        const sortByAdmin = document.getElementById("sortByAdmin")
        sortByAdmin.innerHTML = `<option value="">-- All Admin --</option>` // Reset dropdown

        const adminsSnapshot = await getDocs(collection(db, "admins"))

        if (adminsSnapshot.empty) {
            console.warn("No admins found in the database.")
            return
        }

        adminsSnapshot.forEach(docSnap => {
            const adminData = docSnap.data()
            const adminUID = docSnap.id

            // ✅ Only include users with role "Admin"
            if (adminData.role && adminData.role === "Admin") {
                const adminName = adminData.name || "Unnamed Admin"

                const option = document.createElement("option")
                option.value = adminUID
                option.textContent = adminName

                sortByAdmin.appendChild(option)
            }
        })
    } catch (error) {
        console.error("Error loading admins for dropdown:", error)
    }
}

async function loadChaptersForFilter() {
    const chapterSelect = document.getElementById("chapter-input");
    chapterSelect.innerHTML = "";

    try {
        // Get all chapter-content documents for the logged-in admin
        const chapterContentSnapshot = await getDocs(
            collection(db, "admins", currentUser.uid, "chapter-content")
        );

        if (chapterContentSnapshot.empty) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No Chapters Found";
            option.disabled = true;
            option.selected = true;
            chapterSelect.appendChild(option);
            chapterSelect.disabled = true;
            return;
        }

        chapterSelect.disabled = false;

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- All Chapter --";
        defaultOption.selected = true;
        chapterSelect.appendChild(defaultOption);

        // Loop through each chapter-content doc
        for (const docSnap of chapterContentSnapshot.docs) {
            const chapterData = docSnap.data();
            const chapterID = docSnap.id; // admin’s chapter doc ID
            const globalChapterID = chapterData.chapterID; // reference to global "chapters" collection

            let chapterTitle = `Chapter ${chapterID}`;

            // 🔹 Fetch the chapter title from the global "chapters" collection
            if (globalChapterID) {
                const globalChapterSnap = await getDoc(doc(db, "chapters", globalChapterID));
                if (globalChapterSnap.exists()) {
                    chapterTitle = globalChapterSnap.data().chapterTitle || chapterTitle;
                }
            }

            const option = document.createElement("option");
            option.value = chapterID; // this ID is used for filtering
            option.textContent = chapterTitle;
            chapterSelect.appendChild(option);
        }
    } catch (error) {
        console.error("❌ Error loading chapters for filter:", error);
    }
}

async function loadLessonsForSelectedChapter(chapterID) {
    const lessonSelect = document.getElementById("lesson-input");
    lessonSelect.innerHTML = "";
    lessonSelect.disabled = true;

    if (!chapterID) {
        lessonSelect.appendChild(new Option("-- All Lesson --", ""));
        return;
    }

    try {
        const chapterRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterID);
        const chapterSnap = await getDoc(chapterRef);

        if (!chapterSnap.exists()) {
            console.warn("No chapter document found.");
            return;
        }

        const chapterData = chapterSnap.data();
        const globalChapterId = chapterData.chapterID;

        // Fetch local lessons under this chapter
        const lessonsRef = collection(chapterRef, "lessons");
        const lessonsSnap = await getDocs(lessonsRef);

        if (lessonsSnap.empty) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No Lessons Found";
            option.disabled = true;
            option.selected = true;
            lessonSelect.appendChild(option);
            return;
        }

        // Enable dropdown
        lessonSelect.disabled = false;
        lessonSelect.appendChild(new Option("-- All Lesson --", ""));

        for (const docSnap of lessonsSnap.docs) {
            const localLessonId = docSnap.id;
            const localData = docSnap.data();

            const customLessonId = localData.lessonID || localLessonId;
            const lessonLabel = localData.lessonLabel || `Lesson ${localLessonId}`;

            let lessonTitle = "";

            if (globalChapterId && customLessonId) {
                try {
                    const globalLessonRef = doc(db, "chapters", globalChapterId, "lessons", customLessonId);
                    const globalLessonSnap = await getDoc(globalLessonRef);
                    if (globalLessonSnap.exists()) {
                        lessonTitle = globalLessonSnap.data().lessonTitle || lessonLabel;
                    } else {
                        lessonTitle = lessonLabel; // fallback
                    }
                } catch (err) {
                    console.warn(`⚠️ Failed to fetch global lesson for ${customLessonId}`, err);
                    lessonTitle = lessonLabel; // fallback
                }
            } else {
                lessonTitle = lessonLabel; // fallback
            }

            const option = document.createElement("option");
            // option.value = localLessonId; // Use local ID for filtering
            option.value = lessonLabel;
            option.textContent = lessonTitle;
            lessonSelect.appendChild(option);
        }
    } catch (error) {
        console.error("❌ Error loading lessons for selected chapter:", error);
    }
}

document.getElementById("sortByAdmin").addEventListener("change", (e) => {
    selectedAdminUID = e.target.value
    filterQuestions()
})

document.getElementById("chapter-input").addEventListener("change", (e) => {
    selectedChapterID = e.target.value;
    loadLessonsForSelectedChapter(selectedChapterID);
    filterQuestions();
});

document.getElementById("lesson-input").addEventListener("change", (e) => {
    selectedLessonID = e.target.value;
    console.log("Lesson Label: ", selectedLessonID)
    filterQuestions();
});

searchBar.addEventListener("input", () => {
    currentSearchTerm = searchBar.value.trim()
    filterQuestions()
})

questionType.addEventListener("change", (e) => {
    selectedQuestionType = e.target.value
    filterQuestions()
})

async function filterQuestions() {
    try {
        const questionContainer = document.getElementById("question-container")
        questionContainer.innerHTML = ""
        showLoading()
        hideEmptyState()

        // Build Firestore query based on selected filters
        let filters = []
        if (selectedAdminUID) {
            filters.push(where("createdBy", "==", selectedAdminUID))
        }
        if (selectedQuestionType) {
            filters.push(where("questionType", "==", selectedQuestionType))
        }
        if (selectedChapterID) {
            filters.push(where("underChapter", "==", selectedChapterID));
        }
        if (selectedLessonID) {
            filters.push(where("underLesson", "==", selectedLessonID));
        }


        let q
        if (filters.length > 0) {
            q = query(collection(db, "questions"), ...filters)
        } else {
            q = collection(db, "questions") // no filters = load all
        }

        const snapshot = await getDocs(q)

        if (snapshot.empty) {
            showEmptyState()
            hideLoading()
            return
        }

        let visibleCount = 0

        for (const docSnap of snapshot.docs) {
            const qData = docSnap.data()
            const status = qData.status || "unknown"

            let formattedQuestion = Array.isArray(qData.question)
                ? qData.question.join("\n\n")
                : qData.question || "No question text"
            formattedQuestion = formattedQuestion.replace(/@/g, '____')

            const formattedAnswer = Array.isArray(qData.answer)
                ? qData.answer.join(", ")
                : qData.answer || "No answer provided"

            // Apply search filter
            const lowerSearch = currentSearchTerm.toLowerCase()
            if (
                lowerSearch &&
                !formattedQuestion.toLowerCase().includes(lowerSearch) &&
                !formattedAnswer.toLowerCase().includes(lowerSearch)
            ) {
                continue // skip this card
            }

            const questionID = qData.questionID || docSnap.id

            const card = document.createElement("div")
            card.classList.add("question-card")
            card.style.position = "relative"
            card.innerHTML = `
                <h2 class="question-title">Question ${questionID}</h2>
                <br>
                <p class="question-items"><strong>Question:</strong></p>
                <pre><code>${formattedQuestion}</code></pre>
                <br>
                <hr><br>
                <p class="question-answers"><strong>Answer:</strong></p>
                <pre><code>${formattedAnswer}</code></pre>
                <span class="status-badge">${status.toUpperCase()}</span>
            `

            questionContainer.appendChild(card)

            card.addEventListener("click", () => {
                openModal(questionID, qData, docSnap.id)
            })

            visibleCount++
        }

        // Style status badges
        const badges = document.querySelectorAll(".status-badge")
        badges.forEach(badge => {
            badge.style.position = "absolute"
            badge.style.top = "10px"
            badge.style.right = "15px"
            badge.style.fontSize = "12px"
            badge.style.fontWeight = "bold"
            badge.style.padding = "4px 8px"
            badge.style.borderRadius = "12px"
            badge.style.color = "#fff"
            badge.style.backgroundColor = badge.textContent === "ACTIVE" ? "green" : "gray"
        })

        if (visibleCount === 0) showEmptyState()
        else hideEmptyState()

        hideLoading()

    } catch (error) {
        console.error("Error filtering questions:", error)
        hideLoading()
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

async function openModal(questionID, qData, docId) {
    const modalQuestionType = document.getElementById("modal-question-type")
    const modalQuestion = document.getElementById("modal-question")
    const modalChoices = document.getElementById("modal-choices")
    const modalInstruction = document.getElementById("modal-instruction")
    const answerdiv = document.querySelector(".modal-answer-div")
    const matchlbl = document.getElementById("modal-matching-label");
    const modalMatchingPairs = document.getElementById("modal-matching-pairs");

    modalTitle.textContent = `Question ${questionID}`

    let formattedQuestion = Array.isArray(qData.question)
        ? qData.question.join("\n\n")
        : qData.question || "No question text";

    formattedQuestion = formattedQuestion.replace(/@/g, '____');

    modalQuestion.innerHTML = `<strong>Question:</strong><pre><code>${formattedQuestion} </code></pre>`

    // Show instruction
    modalInstruction.innerHTML = `<strong>Instruction:</strong> ${qData.instruction || "No instruction provided"}`;

    // Show type
    const typeFormatted = formatQuestionType(qData.questionType)
    modalQuestionType.innerHTML = `<strong>Type: </strong>${typeFormatted}`

    modalQuestion.style.textAlign = "center"
    modalQuestion.style.display = "block"
    answerdiv.style.display = "block"
    modalChoices.style.display = "grid"
    modalMatchingPairs.style.display = "none"
    matchlbl.style.display = "none"


    if (qData.questionType === "multipleChoice") {
        try {
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
                        input.attributes.readOnly = true; // make it read-only
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
        modalChoices.style.display = "none"
    }
    else if (qData.questionType === "debugging") {
        try {
            modalQuestion.style.textAlign = "left"

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
                        input.attributes.readOnly = true; // make it read-only
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
    } else if (qData.questionType === "matchingType") {
        try {
            modalQuestion.style.display = "none"
            modalChoices.style.display = "none"
            answerdiv.style.display = "none"
            matchlbl.style.display = "block"
            modalMatchingPairs.style.display = "block"

            const matchRef = doc(db, "questions", docId);
            const matchSnap = await getDoc(matchRef);

            modalMatchingPairs.innerHTML = ''; // Clear previous content

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
                                <textarea class="matching-input" id="matching-input-answer" readonly>${answer[i]}</textarea>
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

    // ✅ Answer
    const formattedAnswer = Array.isArray(qData.answer)
        ? qData.answer.join(", ")
        : qData.answer || "No answer provided";

    modalAnswer.innerHTML = `<strong>Answer:</strong> ${formattedAnswer}`;

    // ✅ Status
    modalStatus.textContent = (qData.status || "Unknown").toUpperCase()
    modalStatus.style.backgroundColor =
        qData.status === "active" ? "green" : "gray"

    modal.style.display = "block"

    currentQuestionData = { ...qData, id: docId, questionID };

    if (qData.createdBy === currentUser.uid) {
        editContainer.style.display = "flex"
    } else {
        editContainer.style.display = "none"
    }
}

// Close modal
closeBtn.onclick = () => (modal.style.display = "none")
// window.onclick = (e) => {
//     if (e.target == modal) {
//         modal.style.display = "none"
//     }
// }

// -----------------------------------------------------------------------------------
// ADD QUESTION
async function openAddQuestionModal() {
    addQuestionModal.style.display = "flex";
    document.body.classList.add("modal-open");

    const loader = document.getElementById("add-modal-loader");
    const form = document.getElementById("add-question-form");
    loader.style.display = "flex";
    form.style.display = "none";

    try {
        const createdByField = document.getElementById("created-by");
        const user = auth.currentUser;
        createdByField.value = user ? user.email : "Unknown Admin";

        const uniqueID = await generateUniqueQuestionID();
        document.getElementById("question-id").value = uniqueID;

        // Load chapter options
        await loadChaptersForModal();

        // Prefill Chapter & Lesson if saved in sessionStorage
        const defaultChapter = sessionStorage.getItem("defaultChapter");
        const defaultLesson = sessionStorage.getItem("defaultLesson");

        if (defaultChapter) {
            const chapterSelect = document.getElementById("under-chapter");
            chapterSelect.value = defaultChapter;

            // Load lessons for that chapter
            await loadLessonsForModal(defaultChapter);

            if (defaultLesson) {
                const lessonSelect = document.getElementById("under-lesson");
                lessonSelect.value = defaultLesson;
                document.getElementById("add-question-type").disabled = false;
            }
            document.getElementById("set-default-selection").checked = true;
        }

        toggleDefaultSelectionVisibility();
        instructionFieldGroup.style.display = "none";
        toggleAdminPasswordField();

    } finally {
        loader.style.display = "none";
        form.style.display = "block";

        setTimeout(() => {
            form.classList.add("visible");
        }, 50);
    }
}

function closeAddQuestionModal() {
    document.getElementById("add-question-form").reset();
    addQuestionModal.style.display = "none";
    document.getElementById("choices-section").style.display = "none"; // reset choices section
    document.body.classList.remove("modal-open");
}

async function generateUniqueQuestionID() {
    let questionID;
    let exists = true;

    while (exists) {
        // Generate a random number (6-digit for example)
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        questionID = `CQ-${randomNum}`;

        // Check Firestore if this ID already exists
        const querySnapshot = await getDocs(
            query(collection(db, "questions"), where("questionID", "==", questionID))
        );

        exists = !querySnapshot.empty; // true if found, regenerate if duplicate
    }

    return questionID;
}

function toggleAdminPasswordField() {
    const passwordWrapper = document.getElementById("admin-password-verification");

    if (adminPasswordPreference === "always") {
        passwordWrapper.style.display = "block";
    } else if (adminPasswordPreference === "once") {
        passwordWrapper.style.display = "none";
    }
}

async function loadChaptersForModal() {
    const chapterSelect = document.getElementById("under-chapter");
    const lessonSelect = document.getElementById("under-lesson");
    const qTypeSelect = document.getElementById("add-question-type");

    const choicesSection = document.getElementById("choices-section");
    const matchingSection = document.getElementById("matching-section");
    const dragDropSection = document.getElementById("dragdrop-section");
    const questionText = document.getElementById("question-text-form");
    const answerText = document.getElementById("answer-text-form");

    choicesSection.style.display = "none";
    matchingSection.style.display = "none";
    dragDropSection.style.display = "none";
    questionText.style.display = "none";
    answerText.style.display = "none";

    chapterSelect.innerHTML = "";
    lessonSelect.innerHTML = `<option value="" disabled selected>-- Select a Chapter First --</option>`;
    lessonSelect.disabled = true;

    // ✅ Disable question type until lesson is selected
    qTypeSelect.value = "";
    qTypeSelect.disabled = true;

    try {
        // Get the chapter content subcollection for the specific admin
        const chapterContentSnapshot = await getDocs(collection(db, "admins", currentUser.uid, "chapter-content"));

        if (chapterContentSnapshot.empty) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No Chapters Found";
            option.disabled = true;
            option.selected = true;
            chapterSelect.appendChild(option);
            chapterSelect.disabled = true;
            return;
        }

        chapterSelect.disabled = false;

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Select a Chapter --";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        chapterSelect.appendChild(defaultOption);

        // Loop through each chapter-content doc (Chapter1, Chapter2, etc.)
        for (const docSnap of chapterContentSnapshot.docs) {
            const chapterData = docSnap.data();
            const chapterID = chapterData.chapterID; // This references the doc ID in the "chapters" collection

            // Get the chapter details from the "chapters" collection
            const chapterSnapshot = await getDoc(doc(db, "chapters", chapterID));

            if (chapterSnapshot.exists()) {
                const chapterTitle = chapterSnapshot.data().chapterTitle || `Chapter ${chapterID.replace(/\D+/g, '')}`;

                const option = document.createElement("option");
                option.value = docSnap.id;
                option.textContent = chapterTitle;
                chapterSelect.appendChild(option);
            }
        }

    }
    catch (error) {
        console.error(" Error loading chapters:", error);
    }
}

document.getElementById("under-chapter").addEventListener("change", (e) => {
    const chapterId = e.target.value;

    console.log("Selected Chapter ID:", chapterId);

    const lessonSelect = document.getElementById("under-lesson");
    const qTypeSelect = document.getElementById("add-question-type");

    if (!chapterId) {
        lessonSelect.innerHTML = `<option value="" disabled selected>-- Select a Chapter First --</option>`;
        lessonSelect.disabled = true;
        qTypeSelect.disabled = true;
        return;
    }

    if (document.getElementById("set-default-selection").checked) {
        saveDefaultSelection();
    }

    toggleDefaultSelectionVisibility();

    loadLessonsForModal(chapterId);
});

async function loadLessonsForModal(chapterId) {
    const lessonSelect = document.getElementById("under-lesson");
    const qTypeSelect = document.getElementById("add-question-type");

    lessonSelect.innerHTML = "";  // Clear previous options
    lessonSelect.disabled = true;
    qTypeSelect.disabled = true;

    try {
        // Fetch the chapterContent snapshot for the current admin
        const chapterContentRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterId);
        const chapterContentSnapshot = await getDoc(chapterContentRef);

        const chapterData = chapterContentSnapshot.data();
        const chapterID = chapterData.chapterID;  // This is the actual chapterID stored under the "chapter-content"

        console.log("Retrieved Chapter ID:", chapterID);

        const lessonContentSnapshot = await getDocs(collection(chapterContentRef, "lessons"));

        if (lessonContentSnapshot.empty) {
            lessonSelect.innerHTML = `<option value="" disabled selected>No Lessons Found</option>`;
            return;
        }

        lessonSelect.disabled = false;

        // Add a default "Select a Lesson" option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Select a Lesson --";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        lessonSelect.appendChild(defaultOption);

        // Iterate through each lesson in the chapter's lessons collection
        for (const docSnap of lessonContentSnapshot.docs) {
            const lessonData = docSnap.data();
            const lessonID = lessonData.lessonID// The ID of the lesson document

            console.log("Found Lesson ID:", lessonID);

            // Fetch the lesson title from the lessons subcollection inside the chapter
            const lessonSnapshot = await getDoc(doc(db, "chapters", chapterID, "lessons", lessonID));

            if (lessonSnapshot.exists()) {
                const lessonTitle = lessonSnapshot.data().lessonTitle || `Lesson ${lessonID.replace(/\D+/g, '')}`;

                const option = document.createElement("option");
                // option.value = docSnap.id;  // Use lessonID as the value
                option.value = docSnap.lessonLabel;
                option.textContent = lessonTitle;  // Format lesson info
                lessonSelect.appendChild(option);
            }
        }

        // Enable Question Type ONLY after lesson is selected
        lessonSelect.addEventListener("change", (e) => {
            if (e.target.value) {
                qTypeSelect.disabled = false;
            } else {
                qTypeSelect.disabled = true;
            }

            if (document.getElementById("set-default-selection").checked) {
                saveDefaultSelection();
            }

            toggleDefaultSelectionVisibility();
        });

    } catch (error) {
        console.error("Error loading lessons:", error);
    }
}

async function handleQuestionTypeChange() {
    const type = document.getElementById("add-question-type").value;
    const choicesSection = document.getElementById("choices-section");
    const matchingSection = document.getElementById("matching-section");
    const dragDropSection = document.getElementById("dragdrop-section");
    const questionText = document.getElementById("question-text-form");
    const answerText = document.getElementById("answer-text-form");

    instructionFieldGroup.style.display = "block";

    if (type === "multipleChoice") {
        choicesSection.style.display = "block";
        matchingSection.style.display = "none";
        dragDropSection.style.display = "none";
        questionText.style.display = "block";
        answerText.style.display = "block";

        answerContainer.innerHTML = `
            <label for="question-answer">Answer</label>
            <input type="text" id="question-answer" class="form-control" required>
        `;

        // Reset choices
        document.querySelectorAll("#choices-section textarea").forEach((textarea, index) => {
            textarea.value = "";
            textarea.readOnly = index === 0;
        });

        instructionField.value = "Select the correct answer from the choices below.";

        // ✅ ADD THIS: Wait for user input before copying to choice1
        const answerInput = document.getElementById("question-answer");
        const choice1 = document.getElementById("choice1");

        if (answerInput && choice1) {
            answerInput.addEventListener("input", () => {
                const value = answerInput.value.trim();
                choice1.value = value;
                choice1.readOnly = !!value; // readOnly if there's any content
            });
        }
    }
    else if (type === "matchingType") {
        choicesSection.style.display = "none";
        matchingSection.style.display = "block";
        dragDropSection.style.display = "none";
        questionText.style.display = "none";
        answerText.style.display = "none";

        // ✅ Reset matching pairs to 2 empty ones
        resetMatchingPairs();

        instructionField.value = "Match the questions with the correct answers.";
    }
    else if (type === "debugging") {
        choicesSection.style.display = "none";
        matchingSection.style.display = "none";
        dragDropSection.style.display = "block";
        questionText.style.display = "none";
        answerText.style.display = "none";

        // Reset fields
        document.getElementById("dragdrop-statement").value = "";
        document.getElementById("dragdrop-answers").innerHTML = "";
        document.getElementById("dragdrop-choices").innerHTML = `
            <div class="choice-item d-flex mb-2">
                <textarea class="form-control choice-input" placeholder="Choice 1" rows="3"></textarea>
            </div>
            <div class="choice-item d-flex mb-2">
                <textarea class="form-control choice-input" placeholder="Choice 2" rows="3"></textarea>
            </div>`;
        document.getElementById("dragdrop-complete").value = "";

        instructionField.value = "Complete the syntax of the following code snippet. Choose the correct code blocks to make the code functional.";
    }
    else if (type === "trueOrFalse") {
        choicesSection.style.display = "none";
        matchingSection.style.display = "none";
        dragDropSection.style.display = "none";
        questionText.style.display = "block";
        answerText.style.display = "block";

        instructionField.value = "Determine whether the statement is True or False.";

        // Replace #question-answer with a dropdown for true/false
        answerContainer.innerHTML = `
            <label for="question-answer">Answer</label>
            <select id="question-answer" class="form-control" required>
                <option value="">-- Select Answer --</option>
                <option value="true">True</option>
                <option value="false">False</option>
            </select>
        `;
    }
    else {
        choicesSection.style.display = "none";
        matchingSection.style.display = "none";
        dragDropSection.style.display = "none";
        questionText.style.display = "none";
        answerText.style.display = "none";

        instructionField.value = "";

        answerContainer.innerHTML = `
            <label for="question-answer">Answer</label>
            <input type="text" id="question-answer" class="form-control" required>
        `;
    }
}

document.getElementById("question-answer")?.addEventListener("input", function () {
    const choice1 = document.getElementById("choice1");
    if (!choice1) return;

    // Only update if question type is currently multipleChoice
    const type = document.getElementById("add-question-type").value;
    if (type === "multipleChoice") {
        choice1.value = this.value.trim();
    }
});

function resetMatchingPairs() {
    const container = document.getElementById("matching-pairs");
    container.innerHTML = ""; // Clear all existing pairs

    // Add exactly 2 fresh empty pairs
    addMatchingPair();
    addMatchingPair();
}

function addMatchingPair() {
    const container = document.getElementById("matching-pairs");
    const pairCount = container.children.length + 1;

    const div = document.createElement("div");
    div.classList.add("matching-pair", "d-flex", "mb-2");

    div.innerHTML = `
        <textarea class="form-control mr-2 matching-question" placeholder="Question ${pairCount}" rows="3"></textarea>
        <textarea class="form-control matching-answer" placeholder="Answer ${pairCount}" rows="3"></textarea>
    `;

    container.appendChild(div);
}

function removeMatchingPair() {
    const container = document.getElementById("matching-pairs");

    if (container.children.length > 2) {
        container.removeChild(container.lastElementChild);
    } else {
        showAlert("You must have at least 2 matching pairs.", "warning");
    }
}

function getMatchingPairs() {
    const questions = [];
    const answers = [];

    document.querySelectorAll(".matching-question").forEach(input => questions.push(input.value));
    document.querySelectorAll(".matching-answer").forEach(input => answers.push(input.value));

    return { questions, answers };
}

function rebuildDragdropAnswers() {
    const statementEl = document.getElementById("dragdrop-statement");
    const answersWrap = document.getElementById("dragdrop-answers");

    if (!statementEl || !answersWrap) return;

    const statement = statementEl.value || "";

    // const maxBlanks = 5;
    // const blanks = Math.min((statement.match(/@/g) || []).length, maxBlanks);

    const blanks = (statement.match(/@/g) || []).length;

    // Get previous values (to preserve)
    const prevValues = Array.from(
        answersWrap.querySelectorAll(".dragdrop-answer")
    ).map((inp) => inp.value);

    // Clear and rebuild answer inputs
    answersWrap.innerHTML = "";
    for (let i = 0; i < blanks; i++) {
        const row = document.createElement("div");
        row.className = "d-flex mb-2";

        const textarea = document.createElement("textarea");
        textarea.className = "form-control dragdrop-answer";
        textarea.placeholder = `Answer ${i + 1}`;
        textarea.rows = 3;
        textarea.value = prevValues[i] || "";  // 👈 preserve existing answer

        // Update the complete statement whenever an answer changes
        textarea.addEventListener("input", updateDragdropComplete);

        row.appendChild(textarea);
        answersWrap.appendChild(row);
    }

    // ✅ Rebuild the readonly answer choices without resetting custom ones
    updateDragdropComplete(); // this will call syncAnswersToChoices()
}

function updateDragdropComplete() {
    const statementEl = document.getElementById("dragdrop-statement");
    const completeEl = document.getElementById("dragdrop-complete");
    const answerInputs = document.querySelectorAll(".dragdrop-answer");

    if (!statementEl || !completeEl) return;

    const statement = statementEl.value || "";
    const parts = statement.split("@"); // N blanks -> parts length = N+1
    const answers = Array.from(answerInputs).map((inp) => inp.value || "");

    // Interleave parts with answers
    let result = parts[0] || "";
    for (let i = 0; i < answers.length; i++) {
        result += (answers[i] && answers[i].trim() !== "") ? answers[i] : "_____";
        result += parts[i + 1] || "";
    }

    completeEl.value = result;

    syncAnswersToDnDChoices();
}

function syncAnswersToDnDChoices() {
    const answers = Array.from(document.querySelectorAll(".dragdrop-answer"))
        .map((inp) => inp.value.trim())
        .filter((val) => val !== "");

    const choicesWrap = document.getElementById("dragdrop-choices");
    if (!choicesWrap) return;

    // Remove all previous readonly auto-generated answer choices
    choicesWrap.querySelectorAll(".choice-item.readonly-choice").forEach(el => el.remove());

    // Append new readonly choices based on answers
    answers.forEach((answer, index) => {
        const row = document.createElement("div");
        row.className = "choice-item d-flex mb-2 readonly-choice";

        const textarea = document.createElement("textarea");
        textarea.className = "form-control choice-input";
        textarea.placeholder = `Answer ${index + 1}`;
        textarea.rows = 3;
        textarea.value = answer;
        textarea.readOnly = true;

        row.appendChild(textarea);
        choicesWrap.appendChild(row);
    });
}

(function attachDragdropStatementListener() {
    const statementEl = document.getElementById("dragdrop-statement");
    if (!statementEl) return;

    statementEl.addEventListener("input", rebuildDragdropAnswers);

    // Initial build (in case there are already @ in the field)
    rebuildDragdropAnswers();
})();

function addDragDropChoice() {
    const choicesWrap = document.getElementById("dragdrop-choices");
    if (!choicesWrap) return;

    const count = choicesWrap.querySelectorAll(".choice-input").length + 1;

    const row = document.createElement("div");
    row.className = "choice-item d-flex mb-2";

    const textarea = document.createElement("textarea");
    textarea.className = "form-control choice-input";
    textarea.placeholder = `Choice ${count}`;
    textarea.rows = 3;

    row.appendChild(textarea);
    choicesWrap.appendChild(row);
}

function removeDragDropChoice() {
    const choicesWrap = document.getElementById("dragdrop-choices");
    if (!choicesWrap) return;

    const allChoices = choicesWrap.querySelectorAll(".choice-item");
    const editableChoices = Array.from(allChoices).filter(choice => !choice.classList.contains("readonly-choice"));

    if (editableChoices.length > 2) {
        editableChoices[editableChoices.length - 1].remove();
    } else {
        showAlert("You must have at least 2 editable choices in addition to the answers.", "warning");
    }
}

async function addQuestion() {
    // Get elements safely
    const questionIdEl = document.getElementById("question-id");
    const underChapterEl = document.getElementById("under-chapter");
    const underLessonEl = document.getElementById("under-lesson");
    const instructionsEl = document.getElementById("instruction-field");
    const questionTypeEl = document.getElementById("add-question-type");
    const adminPasswordEl = document.getElementById("admin-password");

    if (!underChapterEl || !underLessonEl || !questionTypeEl || !adminPasswordEl || !questionIdEl) {
        showAlert("Form error: Some required fields are missing.", "warning");
        return;
    }

    const underChapter = underChapterEl.value;
    const underLesson = underLessonEl.value;
    const questionType = questionTypeEl.value;
    const createdBy = currentUser.uid;
    const questionID = questionIdEl.value.trim();
    const instruction = instructionsEl ? instructionsEl.value.trim() : "";

    if (adminPasswordPreference === "always") {
        const adminPassword = adminPasswordEl.value.trim();

        if (!adminPassword) {
            showAlert("Admin password is required.", "warning");
            return;
        }

        const isValidPassword = await verifyAdminPassword(adminPassword);
        if (!isValidPassword) {
            showAlert("Incorrect admin password.", "error");
            return;
        }
    }

    // ✅ Form validation
    if (!underChapter || !underLesson || !questionType || !questionID) {
        showAlert("Please fill in all required fields.", "warning");
        return;
    }

    let questionData = {
        underChapter,
        underLesson,
        questionType,
        createdBy,
        instruction,
        questionID,
        createdOn: serverTimestamp(),
        status: "archived", // default status
    };

    try {
        // Handle question types...
        if (questionType === "multipleChoice" || questionType === "trueOrFalse") {
            const question = document.getElementById("question-text").value.trim();
            const answerEl = document.getElementById("question-answer");

            if (!question || !answerEl) {
                showAlert("Please fill in the question and answer.", "warning");
                return;
            }

            const answer = answerEl.value.trim();

            if (questionType === "trueOrFalse") {
                if (answer !== "true" && answer !== "false") {
                    showAlert("Please select 'True' or 'False' as the answer.", "warning");
                    return;
                }

                questionData.answer = answer;
            } else {
                // Multiple choice
                const choices = [
                    document.getElementById("choice1").value.trim(),
                    document.getElementById("choice2").value.trim(),
                    document.getElementById("choice3").value.trim(),
                    document.getElementById("choice4").value.trim()
                ].filter(c => c !== "");

                if (choices.length < 2) {
                    showAlert("Please provide at least 2 choices.", "warning");
                    return;
                }

                questionData.answer = answer;
                questionData.choices = choices;
            }

            questionData.question = question;

        } else if (questionType === "matchingType") {
            const { questions, answers } = getMatchingPairs();
            if (questions.length < 2 || answers.length < 2) {
                showAlert("Matching type must have at least 2 pairs.", "warning");
                return;
            }

            questionData.question = questions;
            questionData.answer = answers;

        } else if (questionType === "debugging") {
            const statement = document.getElementById("dragdrop-statement").value.trim();
            const complete = document.getElementById("dragdrop-complete").value.trim();
            const answers = Array.from(document.querySelectorAll(".dragdrop-answer"))
                .map(inp => inp.value.trim())
                .filter(val => val !== "");
            const choices = Array.from(document.querySelectorAll(".choice-input"))
                .map(inp => inp.value.trim())
                .filter(val => val !== "");

            if (!statement || answers.length === 0 || choices.length < 2) {
                showAlert("Drag & Drop requires statement, answers, and at least 2 choices.", "warning");
                return;
            }

            questionData.question = statement;
            questionData.completeStatement = complete;
            questionData.answer = answers;
            questionData.choices = choices;
        }

        // 🔹 Save to Firestore
        const newDocRef = doc(collection(db, "questions"));
        await setDoc(newDocRef, questionData);

        // ✅ Update adminPasswordPreference if it was "once"
        // if (adminPasswordPreference === "once") {
        //     adminPasswordPreference = "never";
        //     sessionStorage.setItem("adminPasswordPreference", "never");
        // }

        showAlert("Question added successfully!", "success");
        closeAddQuestionModal();
        setTimeout(() => {
            refreshQuestionData();
        }, 1500);

    } catch (error) {
        console.error("❌ Error adding question:", error);
        showAlert("Failed to add question. Check console for details.", "error");
    }
}

document.getElementById("set-default-selection").addEventListener("change", saveDefaultSelection);

// Save chapter & lesson when "Set default" is checked
function saveDefaultSelection() {
    const chapterSelect = document.getElementById("under-chapter");
    const lessonSelect = document.getElementById("under-lesson");
    const setDefault = document.getElementById("set-default-selection");

    if (setDefault.checked) {
        sessionStorage.setItem("defaultChapter", chapterSelect.value);
        sessionStorage.setItem("defaultLesson", lessonSelect.value);
    } else {
        sessionStorage.removeItem("defaultChapter");
        sessionStorage.removeItem("defaultLesson");
    }
}

function toggleDefaultSelectionVisibility() {
    const chapterSelect = document.getElementById("under-chapter");
    const lessonSelect = document.getElementById("under-lesson");
    const defaultGroup = document.getElementById("default-selection-group");

    if (chapterSelect.value && lessonSelect.value) {
        defaultGroup.style.display = "flex"; // show when both are selected
    } else {
        defaultGroup.style.display = "none";  // hide otherwise
    }
}

// -----------------------------------------------------------------------------------
// EDIT QUESTION

editBtn.addEventListener("click", () => {
    if (!currentQuestionData) return;
    openEditQuestionModal(currentQuestionData);
});

function toggleEditAdminPasswordField() {
    const passwordWrapper = document.getElementById("edit-admin-password-verification");
    const pref = sessionStorage.getItem("adminPasswordPreference") || "never";

    if (pref === "always") {
        passwordWrapper.style.display = "block";
    } else {
        passwordWrapper.style.display = "none";
    }
}

async function openEditQuestionModal(questionData) {
    // Show loader, hide form
    document.getElementById("edit-modal-loader").style.display = "flex";
    document.getElementById("edit-question-form").style.display = "none";

    // Disable Save button while loading
    const saveBtn = document.getElementById("save-edit-question-btn");
    if (saveBtn) saveBtn.disabled = true;

    editQuestionModal.style.display = "flex";
    toggleEditAdminPasswordField();

    try {
        // ✅ Prefetch chapters/lessons
        await loadChaptersForEditModal(questionData);

        // Prefill basic fields
        editDocId.value = questionData.id;
        editQuestionId.value = questionData.questionID || "";
        editUnderChapter.value = questionData.underChapter || "";
        editUnderLesson.value = questionData.underLesson || "";
        editQuestionType.value = formatQuestionType(questionData.questionType) || "Unknown Type";
        editInstructionField.value = questionData.instruction || "";

        // Created By (fetch from admins db)
        editCreatedBy.value = "Loading...";
        if (questionData.createdBy) {
            try {
                const adminRef = doc(db, "admins", questionData.createdBy);
                const adminSnap = await getDoc(adminRef);

                if (adminSnap.exists()) {
                    const adminData = adminSnap.data();
                    editCreatedBy.value = adminData.name || adminData.email || questionData.createdBy;
                } else {
                    editCreatedBy.value = questionData.createdBy;
                }
            } catch (err) {
                console.error("❌ Error fetching admin info:", err);
                editCreatedBy.value = questionData.createdBy;
            }
        }

        // Reset sections
        editChoicesSection.style.display = "none";
        editMatchingSection.style.display = "none";
        editDragdropSection.style.display = "none";
        editQuestionForm.style.display = "none";
        editAnswerForm.style.display = "none";
        editAnswerForm.innerHTML = "";

        // ✅ Populate fields based on type
        if (questionData.questionType === "trueOrFalse") {
            editQuestionForm.style.display = "block";
            editAnswerForm.style.display = "block";

            const label = document.createElement("label");
            label.setAttribute("for", "edit-question-answer");
            label.textContent = "Answer";

            const select = document.createElement("select");
            select.id = "edit-question-answer";
            select.className = "form-control";
            select.required = true;
            select.innerHTML = `
                <option value="true">True</option>
                <option value="false">False</option>
            `;

            editAnswerForm.appendChild(label);
            editAnswerForm.appendChild(select);

            editQuestionText.value = questionData.question || "";
            select.value = questionData.answer || "";
        }

        else if (questionData.questionType === "multipleChoice") {
            editChoicesSection.style.display = "block";
            editQuestionForm.style.display = "block";
            editAnswerForm.style.display = "block";

            const label = document.createElement("label");
            label.setAttribute("for", "edit-question-answer");
            label.textContent = "Answer";

            const input = document.createElement("input");
            input.type = "text";
            input.id = "edit-question-answer";
            input.className = "form-control";
            input.required = true;

            editAnswerForm.appendChild(label);
            editAnswerForm.appendChild(input);

            editQuestionText.value = questionData.question || "";
            input.value = questionData.answer || "";

            editChoice1.value = questionData.choices?.[0] || "";
            editChoice1.readOnly = true;
            editChoice2.value = questionData.choices?.[1] || "";
            editChoice3.value = questionData.choices?.[2] || "";
            editChoice4.value = questionData.choices?.[3] || "";

            input.addEventListener("input", () => {
                editChoice1.value = input.value.trim();
            });
        }

        else if (questionData.questionType === "matchingType") {
            editMatchingSection.style.display = "block";
            editMatchingPairs.innerHTML = "";

            const questions = questionData.question || [];
            const answers = questionData.answer || [];

            if (questions.length === answers.length && questions.length > 0) {
                for (let i = 0; i < questions.length; i++) {
                    const div = document.createElement("div");
                    div.className = "matching-pair d-flex mb-2";
                    div.innerHTML = `
                        <textarea class="form-control mr-2 matching-question" rows="3">${questions[i]}</textarea>
                        <textarea class="form-control matching-answer" rows="3">${answers[i]}</textarea>
                    `;
                    editMatchingPairs.appendChild(div);
                }
            } else {
                editMatchingPairs.innerHTML = `<p style="color: red;">Invalid or missing matching data</p>`;
            }
        }

        else if (questionData.questionType === "debugging") {
            editDragdropSection.style.display = "block";
            editDragdropStatement.value = questionData.question || "";

            const answers = questionData.answer || [];
            editDragdropAnswers.innerHTML = "";
            const blanks = (editDragdropStatement.value.match(/@/g) || []).length;

            for (let i = 0; i < blanks; i++) {
                const row = document.createElement("div");
                row.className = "d-flex mb-2";

                const textarea = document.createElement("textarea");
                textarea.className = "form-control dragdrop-answer";
                textarea.placeholder = `Answer ${i + 1}`;
                textarea.rows = 3;
                textarea.value = answers[i] || "";
                textarea.addEventListener("input", updateEditDragdropComplete);

                row.appendChild(textarea);
                editDragdropAnswers.appendChild(row);
            }

            editDragdropChoices.innerHTML = "";
            const choices = questionData.choices || [];
            choices.forEach((choice, idx) => {
                const row = document.createElement("div");
                row.className = "choice-item d-flex mb-2";

                const textarea = document.createElement("textarea");
                textarea.className = "form-control choice-input";
                textarea.placeholder = `Choice ${idx + 1}`;
                textarea.rows = 3;
                textarea.value = choice;

                if (answers.includes(choice)) {
                    textarea.readOnly = true;
                    row.classList.add("readonly-choice");
                }

                row.appendChild(textarea);
                editDragdropChoices.appendChild(row);
            });

            const minChoices = answers.length + 2;
            while (editDragdropChoices.querySelectorAll(".choice-input").length < minChoices) {
                addEditDragDropChoice();
            }

            editDragdropComplete.value = questionData.completeStatement || "";

            editDragdropStatement.removeEventListener("input", rebuildEditDragdropAnswers);
            editDragdropStatement.addEventListener("input", rebuildEditDragdropAnswers);
        }
    } catch (err) {
        console.error("❌ Error loading question for edit:", err);
        showAlert("Failed to load question.", "error");
    } finally {
        // Hide loader, show form
        document.getElementById("edit-modal-loader").style.display = "none";
        const editForm = document.getElementById("edit-question-form");
        editForm.style.display = "block";

        // Trigger fade-in
        setTimeout(() => {
            editForm.classList.add("visible");
        }, 50);

        // Re-enable Save button
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function loadChaptersForEditModal(questionData) {
    const chapterSelect = document.getElementById("edit-under-chapter");
    const lessonSelect = document.getElementById("edit-under-lesson");

    chapterSelect.innerHTML = "";
    lessonSelect.innerHTML = `<option value="" disabled selected>-- Select a Chapter First --</option>`;
    lessonSelect.disabled = true;

    try {
        const chapterContentSnapshot = await getDocs(collection(db, "admins", currentUser.uid, "chapter-content"));

        if (chapterContentSnapshot.empty) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No Chapters Found";
            option.disabled = true;
            option.selected = true;
            chapterSelect.appendChild(option);
            chapterSelect.disabled = true;
            return;
        }

        chapterSelect.disabled = false;

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Select a Chapter --";
        defaultOption.disabled = true;
        chapterSelect.appendChild(defaultOption);

        // Loop through chapters
        for (const docSnap of chapterContentSnapshot.docs) {
            const chapterData = docSnap.data();
            const chapterID = chapterData.chapterID;

            const chapterSnapshot = await getDoc(doc(db, "chapters", chapterID));
            if (chapterSnapshot.exists()) {
                const chapterTitle = chapterSnapshot.data().chapterTitle || `Chapter ${chapterID.replace(/\D+/g, '')}`;

                const option = document.createElement("option");
                option.value = docSnap.id; // doc ID in chapter-content
                option.textContent = chapterTitle;

                // ✅ Preselect if this matches questionData.underChapter
                if (docSnap.id === questionData.underChapter) {
                    option.selected = true;
                    // ✅ Pass saved underLesson (which is the lessonLabel) instead of title
                    await loadLessonsForEditModal(docSnap.id, questionData.underLesson);
                    console.log("Chapter: ", docSnap.id);
                    console.log("Lesson: ", questionData.underLesson);
                }

                chapterSelect.appendChild(option);
            }
        }

        // Add listener for manual change (in case user edits)
        chapterSelect.addEventListener("change", async (e) => {
            const chapterId = e.target.value;
            if (chapterId) {
                await loadLessonsForEditModal(chapterId, null); // reset lesson prefill if user changes
            } else {
                lessonSelect.innerHTML = `<option value="" disabled selected>-- Select a Chapter First --</option>`;
                lessonSelect.disabled = true;
            }
        });

    } catch (error) {
        console.error("Error loading chapters in edit modal:", error);
    }
}

async function loadLessonsForEditModal(chapterId, prefillLessonLabel) {
    const lessonSelect = document.getElementById("edit-under-lesson");

    lessonSelect.innerHTML = "";
    lessonSelect.disabled = true;

    try {
        const chapterContentRef = doc(db, "admins", currentUser.uid, "chapter-content", chapterId);
        const chapterContentSnapshot = await getDoc(chapterContentRef);

        if (!chapterContentSnapshot.exists()) {
            lessonSelect.innerHTML = `<option value="" disabled selected>No Lessons Found</option>`;
            return;
        }

        const chapterData = chapterContentSnapshot.data();
        const chapterID = chapterData.chapterID;

        const lessonContentSnapshot = await getDocs(collection(chapterContentRef, "lessons"));

        if (lessonContentSnapshot.empty) {
            lessonSelect.innerHTML = `<option value="" disabled selected>No Lessons Found</option>`;
            return;
        }

        lessonSelect.disabled = false;

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Select a Lesson --";
        defaultOption.disabled = true;
        lessonSelect.appendChild(defaultOption);

        for (const docSnap of lessonContentSnapshot.docs) {
            const lessonData = docSnap.data();
            const lessonID = lessonData.lessonID;

            const lessonSnapshot = await getDoc(doc(db, "chapters", chapterID, "lessons", lessonID));

            if (lessonSnapshot.exists()) {
                const lessonTitle = lessonSnapshot.data().lessonTitle || `Lesson ${lessonID.replace(/\D+/g, '')}`;

                const option = document.createElement("option");
                option.value = lessonData.lessonLabel; // ✅ value is lessonLabel
                option.textContent = lessonTitle;

                // ✅ Compare saved underLesson with lessonLabel, not title
                if (lessonData.lessonLabel === prefillLessonLabel) {
                    option.selected = true;
                }

                lessonSelect.appendChild(option);
            }
        }

    } catch (error) {
        console.error("Error loading lessons in edit modal:", error);
    }
}

function closeEditQuestionModal() {
    editQuestionModal.style.display = "none";
}

function addEditMatchingPair() {
    const container = document.getElementById("edit-matching-pairs");
    const pairCount = container.children.length + 1;

    const div = document.createElement("div");
    div.classList.add("matching-pair", "d-flex", "mb-2");

    div.innerHTML = `
        <textarea class="form-control mr-2 matching-question" placeholder="Question ${pairCount}" rows="3"></textarea>
        <textarea class="form-control matching-answer" placeholder="Answer ${pairCount}" rows="3"></textarea>
    `;

    container.appendChild(div);
}

function removeEditMatchingPair() {
    const container = document.getElementById("edit-matching-pairs");
    if (container.children.length > 2) {
        container.removeChild(container.lastElementChild);
    } else if (container.children.length == 2) {
        showAlert("You need to have at least 2 matching pairs!", "error");
    }
}

function getEditMatchingPairs() {
    const questions = [];
    const answers = [];

    editMatchingPairs.querySelectorAll(".matching-question").forEach(input => questions.push(input.value));
    editMatchingPairs.querySelectorAll(".matching-answer").forEach(input => answers.push(input.value));

    return { questions, answers };
}

function rebuildEditDragdropAnswers() {
    const statement = editDragdropStatement.value || "";
    const blanks = (statement.match(/@/g) || []).length;

    const prevValues = Array.from(
        editDragdropAnswers.querySelectorAll(".dragdrop-answer")
    ).map(inp => inp.value);

    editDragdropAnswers.innerHTML = "";
    for (let i = 0; i < blanks; i++) {
        const row = document.createElement("div");
        row.className = "d-flex mb-2";

        const textarea = document.createElement("textarea");
        textarea.className = "form-control dragdrop-answer";
        textarea.placeholder = `Answer ${i + 1}`;
        textarea.rows = 3;
        textarea.value = prevValues[i] || "";

        textarea.addEventListener("input", updateEditDragdropComplete);

        row.appendChild(textarea);
        editDragdropAnswers.appendChild(row);
    }

    updateEditDragdropComplete();
}

function updateEditDragdropComplete() {
    const statement = editDragdropStatement.value || "";
    const answers = Array.from(editDragdropAnswers.querySelectorAll(".dragdrop-answer"))
        .map(inp => inp.value || "");

    const parts = statement.split("@");
    let result = parts[0] || "";
    for (let i = 0; i < answers.length; i++) {
        result += answers[i] ? answers[i] : "_____";
        result += parts[i + 1] || "";
    }

    editDragdropComplete.value = result;

    syncEditAnswersToChoices();
}

function syncEditAnswersToChoices() {
    const answers = Array.from(editDragdropAnswers.querySelectorAll(".dragdrop-answer"))
        .map(inp => inp.value.trim())
        .filter(val => val !== "");

    // remove old readonly
    editDragdropChoices.querySelectorAll(".readonly-choice").forEach(el => el.remove());

    // append readonly answers
    answers.forEach((ans, idx) => {
        const row = document.createElement("div");
        row.className = "choice-item d-flex mb-2 readonly-choice";

        const textarea = document.createElement("textarea");
        textarea.className = "form-control choice-input";
        textarea.placeholder = `Answer ${idx + 1}`;
        textarea.rows = 3;
        textarea.value = ans;
        textarea.readOnly = true;

        row.appendChild(textarea);
        editDragdropChoices.appendChild(row);
    });
}

function addEditDragDropChoice() {
    const count = editDragdropChoices.querySelectorAll(".choice-input").length + 1;

    const row = document.createElement("div");
    row.className = "choice-item d-flex mb-2";

    const textarea = document.createElement("textarea");
    textarea.className = "form-control choice-input";
    textarea.placeholder = `Choice ${count}`;
    textarea.rows = 3;

    row.appendChild(textarea);
    editDragdropChoices.appendChild(row);
}

function removeEditDragDropChoice() {
    const allChoices = editDragdropChoices.querySelectorAll(".choice-item");
    const editableChoices = Array.from(allChoices).filter(c => !c.classList.contains("readonly-choice"));

    if (editableChoices.length > 2) {
        editableChoices[editableChoices.length - 1].remove();
    } else {
        showAlert("You must have at least 2 editable choices in addition to the answers.", "warning");
    }
}

async function saveEditedQuestion() {
    const docId = editDocId.value; // 🔹 real Firestore ID

    // Elements
    const underChapterEl = editUnderChapter;
    const underLessonEl = editUnderLesson;
    const instructionsEl = editInstructionField;
    const adminPasswordEl = document.getElementById("edit-admin-password");

    if (!underChapterEl || !underLessonEl || !instructionsEl) {
        showAlert("Form error: Some required fields are missing.", "warning");
        return;
    }

    const underChapter = underChapterEl.value;
    const underLesson = underLessonEl.value;
    const instruction = instructionsEl.value.trim();

    // 🔹 Admin password preference check
    const adminPasswordPreference = sessionStorage.getItem("adminPasswordPreference") || "never";
    if (adminPasswordPreference === "always") {
        const adminPassword = adminPasswordEl ? adminPasswordEl.value.trim() : "";
        if (!adminPassword) {
            showAlert("Admin password is required.", "warning");
            return;
        }
        const isValidPassword = await verifyAdminPassword(adminPassword);
        if (!isValidPassword) {
            showAlert("Incorrect admin password.", "error");
            return;
        }
    }

    // ✅ Required field validation
    if (!underChapter || !underLesson) {
        showAlert("Please fill in all required fields.", "warning");
        return;
    }

    const updatedData = {
        underChapter,
        underLesson,
        instruction,
        updatedAt: new Date(),
        updatedBy: sessionStorage.getItem("adminUID") || "unknown-admin",
        adminPasswordPreference
    };

    // -------- MULTIPLE CHOICE / TRUE OR FALSE ----------
    if (editChoicesSection.style.display === "block" || editAnswerForm.style.display === "block") {
        const question = editQuestionText.value.trim();
        const answerField = document.getElementById("edit-question-answer");

        if (!question || !answerField || !answerField.value.trim()) {
            showAlert("Question and answer are required.", "warning");
            return;
        }

        updatedData.question = question;
        updatedData.answer = answerField.value.trim();

        if (editChoicesSection.style.display === "block") {
            const choices = [
                editChoice1.value.trim(),
                editChoice2.value.trim(),
                editChoice3.value.trim(),
                editChoice4.value.trim()
            ].filter(c => c !== "");

            if (choices.length < 2) {
                showAlert("Please provide at least 2 choices.", "warning");
                return;
            }
            updatedData.choices = choices;
        }
    }

    // -------- MATCHING TYPE ----------
    if (editMatchingSection.style.display === "block") {
        const questions = [];
        const answers = [];
        editMatchingPairs.querySelectorAll(".matching-pair").forEach(pair => {
            const q = pair.querySelector(".matching-question").value.trim();
            const a = pair.querySelector(".matching-answer").value.trim();
            if (q && a) {
                questions.push(q);
                answers.push(a);
            }
        });

        if (questions.length < 2 || answers.length < 2) {
            showAlert("Matching type must have at least 2 pairs.", "warning");
            return;
        }

        updatedData.question = questions;
        updatedData.answer = answers;
    }

    // -------- DEBUGGING ----------
    if (editDragdropSection.style.display === "block") {
        const statement = editDragdropStatement.value.trim();
        const complete = editDragdropComplete.value.trim();
        const answers = Array.from(document.querySelectorAll(".dragdrop-answer"))
            .map(inp => inp.value.trim())
            .filter(v => v !== "");
        const choices = Array.from(document.querySelectorAll(".choice-input"))
            .map(inp => inp.value.trim())
            .filter(v => v !== "");

        if (!statement || answers.length === 0 || choices.length < 2) {
            showAlert("Debugging requires statement, answers, and at least 2 choices.", "warning");
            return;
        }

        updatedData.question = statement;
        updatedData.completeStatement = complete;
        updatedData.answer = answers;
        updatedData.choices = choices;
    }

    console.log("Saving edited question:", docId, updatedData);

    try {
        await updateDoc(doc(db, "questions", docId), updatedData);
        showAlert("Question updated successfully!", "success");
    } catch (error) {
        console.error("❌ Error updating question:", error);
        showAlert("Failed to update question.", "error");
    }

    modal.style.display = "none"
    closeEditQuestionModal();
    setTimeout(() => {
        refreshQuestionData();
    }, 1500);
}

// -------------------------------------------------------------------------------------
async function refreshQuestionData() {
    await loadStats();
    await loadQuestions();
    showAlert("Data refreshed successfully!", "success");
}

async function verifyAdminPassword(inputPassword) {
    try {
        const user = auth.currentUser;

        if (!user || !user.email) {
            console.warn("No authenticated user found.");
            return false;
        }

        const credential = EmailAuthProvider.credential(user.email, inputPassword);
        await reauthenticateWithCredential(user, credential);

        console.log("✅ Admin password verified successfully");
        return true;

    } catch (error) {
        console.warn("❌ Admin password verification failed:", error.code);
        return false;
    }
}

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

window.verifyAndSetPreference = verifyAndSetPreference

window.openAddQuestionModal = openAddQuestionModal
window.closeAddQuestionModal = closeAddQuestionModal
window.handleQuestionTypeChange = handleQuestionTypeChange
window.addMatchingPair = addMatchingPair
window.removeMatchingPair = removeMatchingPair
window.getMatchingPairs = getMatchingPairs
window.addQuestion = addQuestion
window.addDragDropChoice = addDragDropChoice
window.removeDragDropChoice = removeDragDropChoice

window.openEditQuestionModal = openEditQuestionModal
window.closeEditQuestionModal = closeEditQuestionModal
window.addEditMatchingPair = addEditMatchingPair
window.removeEditMatchingPair = removeEditMatchingPair
window.getEditMatchingPairs = getEditMatchingPairs
window.saveEditedQuestion = saveEditedQuestion
window.addEditDragDropChoice = addEditDragDropChoice
window.removeEditDragDropChoice = removeEditDragDropChoice

if (typeof window !== "undefined") {
    // Ensure DOM is loaded before attaching functions
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attachGlobalFunctions)
    } else {
        attachGlobalFunctions()
    }
}

function attachGlobalFunctions() {
    window.verifyAndSetPreference = verifyAndSetPreference

    window.openAddQuestionModal = openAddQuestionModal
    window.closeAddQuestionModal = closeAddQuestionModal
    window.handleQuestionTypeChange = handleQuestionTypeChange
    window.addMatchingPair = addMatchingPair
    window.removeMatchingPair = removeMatchingPair
    window.getMatchingPairs = getMatchingPairs
    window.addQuestion = addQuestion
    window.addDragDropChoice = addDragDropChoice
    window.removeDragDropChoice = removeDragDropChoice

    window.openEditQuestionModal = openEditQuestionModal
    window.closeEditQuestionModal = closeEditQuestionModal
    window.addEditMatchingPair = addEditMatchingPair
    window.removeEditMatchingPair = removeEditMatchingPair
    window.getEditMatchingPairs = getEditMatchingPairs
    window.saveEditedQuestion = saveEditedQuestion
    window.addEditDragDropChoice = addEditDragDropChoice
    window.removeEditDragDropChoice = removeEditDragDropChoice
}