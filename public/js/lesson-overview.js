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

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA-rXYqdJ5ujIxWNt4PjSJh4FtDyc3hieI",
    authDomain: "codequest-2025.firebaseapp.com",
    projectId: "codequest-2025",
    storageBucket: "codequest-2025.firebasestorage.app",
    messagingSenderId: "5857953993",
    appId: "1:5857953993:web:79cc6a52b3baf9b7b52518",
}

// Cloudinary Config
const CLOUDINARY_CONFIG = {
    cloudName: "dcquhfvnj",
    uploadPreset: "lesson-slides",
    folder: "slides",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)


// Chapter Container
const chapterInput = document.getElementById("chapter-input")
const chapterTitle = document.getElementById("chapter-title")
const chapterDesc = document.getElementById("chapter-desc")
const lessonContainer = document.getElementById("lesson-container")
const lessonCard = document.getElementById("lesson-card")

const addChapterModal = document.getElementById("addChapterModal")
const addLessonModal = document.getElementById("addLessonModal")


// View Lesson Details
const viewLessonModal = document.getElementById("viewLessonModal");
const viewLessonTitle = document.getElementById("view-lesson-title");
const viewLessonDesc = document.getElementById("view-lesson-desc");
const slidesHolder = document.getElementById("slides-holder");
const fileLinkElement = document.getElementById("file-link");
const closeBtn = viewLessonModal.querySelector(".close-btn");


// Add Chapter (+ Lesson) Modal
const chapterIdInput = document.getElementById("chapter-id");
const chapterTitleField = document.getElementById("chapter-title-field");
const chapterDescField = document.getElementById("chapter-desc-field");
const addLessonTrigger = document.getElementById("addChapter-addLesson");

const addChapterBtn = document.getElementById("add-question-btn");

// Hold temporary lessons before saving
let pendingLessons = [];


// Add Lesson Modal
const lessonIdInput = document.getElementById("lesson-id");
const addLessonChapterInput = document.getElementById("add-lesson-chapter-input");
const lessonTitleInput = document.getElementById("lesson-field");
const lessonDescInput = document.getElementById("lesson-desc-field");
const lessonUpload = document.getElementById("lesson-upload")

const status = document.getElementById("upload-status");
const preview = document.getElementById("upload-preview");

// Current 
let currentUser = null
let adminProfile = null

// Check if user is authenticated
document.addEventListener("DOMContentLoaded", () => {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadAdminProfile();

            await loadChaptersDropdown();
            await loadAllLessons();
        } else {
            window.location.href = "../index.html";
        }
    });
})

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

async function loadChaptersDropdown() {
    chapterInput.innerHTML = "";

    try {
        const chaptersSnapshot = await getDocs(collection(db, "chapters"));

        if (chaptersSnapshot.empty) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No Chapters Found";
            option.disabled = true;
            option.selected = true;
            chapterInput.appendChild(option);
            chapterInput.disabled = true;
            return;
        }

        chapterInput.disabled = false;

        // Default option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- All Chapter --";
        defaultOption.selected = true;
        chapterInput.appendChild(defaultOption);

        // Convert snapshot to array for sorting
        let chapters = chaptersSnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                title: data.chapterTitle || `Chapter ${docSnap.id}`,
                label: data.chapterLabel || ""
            };
        });

        // 🔹 Sort by chapterLabel numerically (e.g. Chapter 1, Chapter 2...)
        chapters.sort((a, b) => {
            const numA = parseInt(a.label.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.label.replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        // Append options
        chapters.forEach((chapter) => {
            const option = document.createElement("option");
            option.value = chapter.id;
            option.textContent = chapter.label + " - " + chapter.title;
            chapterInput.appendChild(option);
        });
    } catch (error) {
        console.error("❌ Error loading chapters:", error);
    }
}

chapterInput.addEventListener("change", async (e) => {
    const selectedChapterID = e.target.value;

    if (!selectedChapterID) {
        // Show all lessons if "All Chapters" is selected
        chapterTitle.textContent = "All Chapters";
        chapterDesc.textContent = "Displaying all lessons from every chapter.";
        await loadAllLessons();
        return;
    }

    try {
        // Fetch chapter details
        const chapterSnap = await getDoc(doc(db, "chapters", selectedChapterID));
        if (chapterSnap.exists()) {
            const chapterData = chapterSnap.data();
            chapterTitle.textContent = chapterData.chapterTitle || "Untitled Chapter";
            chapterDesc.textContent = chapterData.chapterDescription || chapterData.chapterDesc || "No description available.";
        }

        // Load lessons
        await loadLessons(selectedChapterID);

    } catch (error) {
        console.error("❌ Error fetching chapter details:", error);
        chapterTitle.textContent = "Error loading chapter";
        chapterDesc.textContent = "";
        lessonContainer.innerHTML = "";
    }
});

async function loadAllLessons() {
    lessonContainer.innerHTML = "";

    try {
        const chaptersSnapshot = await getDocs(collection(db, "chapters"));

        if (chaptersSnapshot.empty) {
            lessonContainer.innerHTML = "<p>No chapters found.</p>";
            return;
        }

        const allLessons = [];

        // Gather lessons and keep chapterID with each entry
        for (const chapterDoc of chaptersSnapshot.docs) {
            const chapterID = chapterDoc.id;
            const chapterData = chapterDoc.data();
            const chapterLabel = chapterData.chapterLabel || `Chapter ${chapterID}`;

            const lessonsSnapshot = await getDocs(
                collection(db, "chapters", chapterID, "lessons")
            );

            lessonsSnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const slides = data.slides || {};
                const firstSlide = Object.values(slides)[0] || "../img/logo.jpeg";

                allLessons.push({
                    id: docSnap.id,
                    chapterID,                     // << keep chapterID here
                    chapterLabel,
                    label: data.lessonLabel || data.lessonNum || "Lesson",
                    title: data.lessonTitle || "Untitled Lesson",
                    preview: firstSlide
                });
            });
        }

        if (allLessons.length === 0) {
            lessonContainer.innerHTML = "<p>No lessons found across all chapters.</p>";
            return;
        }

        // Sort by chapter number then lesson number
        allLessons.sort((a, b) => {
            const chapA = parseInt(a.chapterLabel.replace(/\D/g, "")) || 0;
            const chapB = parseInt(b.chapterLabel.replace(/\D/g, "")) || 0;
            if (chapA !== chapB) return chapA - chapB;

            const numA = parseInt(a.label.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.label.replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        // Render cards and attach listener with chapterID + lessonID
        allLessons.forEach((lesson) => {
            const card = lessonCard.cloneNode(true);

            // remove duplicated id from clones and ensure visible
            card.removeAttribute("id");
            card.style.display = ""; // template was hidden, show the clone

            const labelEl = card.querySelector(".lesson-label");
            const titleEl = card.querySelector(".lesson-title");
            const imgEl = card.querySelector(".lesson-preview");

            if (labelEl) labelEl.textContent = `${lesson.chapterLabel} - ${lesson.label}`;
            if (titleEl) titleEl.textContent = lesson.title;
            if (imgEl) imgEl.src = lesson.preview;

            lessonContainer.appendChild(card);

            // attach listener with the saved chapterID and lesson.id
            attachCardListener(card, lesson.chapterID, lesson.id);
        });
    } catch (error) {
        console.error("❌ Error loading all lessons:", error);
        lessonContainer.innerHTML = "<p>Error loading all lessons.</p>";
    }
}

async function loadLessons(chapterID) {
    lessonContainer.innerHTML = "";

    try {
        const lessonsSnapshot = await getDocs(
            collection(db, "chapters", chapterID, "lessons")
        );

        if (lessonsSnapshot.empty) {
            lessonContainer.innerHTML = "<p>No lessons found for this chapter.</p>";
            return;
        }

        let lessons = lessonsSnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            const slides = data.slides || {};
            const firstSlide = Object.values(slides)[0] || "../img/logo.jpeg";

            return {
                id: docSnap.id,
                chapterID, // keep the chapterID for listener
                label: data.lessonLabel || data.lessonNum || "Lesson",
                title: data.lessonTitle || "Untitled Lesson",
                preview: firstSlide
            };
        });

        // Sort numerically by lessonLabel
        lessons.sort((a, b) => {
            const numA = parseInt(a.label.replace(/\D/g, "")) || 0;
            const numB = parseInt(b.label.replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        // Render lesson cards
        lessons.forEach((lesson) => {
            const card = lessonCard.cloneNode(true);
            card.removeAttribute("id");
            card.style.display = "";

            const labelEl = card.querySelector(".lesson-label");
            const titleEl = card.querySelector(".lesson-title");
            const imgEl = card.querySelector(".lesson-preview");

            if (labelEl) labelEl.textContent = lesson.label;
            if (titleEl) titleEl.textContent = lesson.title;
            if (imgEl) imgEl.src = lesson.preview;

            lessonContainer.appendChild(card);

            // attach the click listener using chapterID (from param) and lesson.id
            attachCardListener(card, chapterID, lesson.id);
        });
    } catch (error) {
        console.error("❌ Error loading lessons:", error);
        lessonContainer.innerHTML = "<p>Error loading lessons.</p>";
    }
}

function openLessonModal(chapterID, lessonID) {
    getDoc(doc(db, "chapters", chapterID, "lessons", lessonID))
        .then((docSnap) => {
            if (!docSnap.exists()) {
                console.error("❌ Lesson not found.");
                return;
            }
            const data = docSnap.data();

            //  Populate modal fields
            viewLessonTitle.textContent =
                (data.lessonLabel ? data.lessonLabel + " - " : "") +
                (data.lessonTitle || "Untitled Lesson");

            viewLessonDesc.textContent = data.lessonDesc || "No description available.";

            //  File link handling
            if (data.fileUrl && data.fileName) {
                fileLinkElement.href = data.fileUrl;
                fileLinkElement.textContent = `Download ${data.fileName}`;
                fileLinkElement.style.display = "inline-block";
                fileLinkElement.setAttribute("target", "_blank");
                fileLinkElement.setAttribute("download", data.fileName);
            } else {
                fileLinkElement.textContent = "No file uploaded";
                fileLinkElement.removeAttribute("href");
                fileLinkElement.style.display = "inline-block";
            }

            //  Clear and load slides
            slidesHolder.innerHTML = "";
            const slides = data.slides || {};
            const slideUrls = Object.values(slides);

            if (slideUrls.length > 0) {
                slideUrls.forEach((url) => {
                    const img = document.createElement("img");
                    img.src = url;
                    img.className = "slides-preview";
                    slidesHolder.appendChild(img);
                });
            } else {
                // fallback logo if no slides
                const img = document.createElement("img");
                img.src = "../img/logo.jpeg";
                img.className = "slides-preview";
                slidesHolder.appendChild(img);
            }

            //  Show modal
            viewLessonModal.style.display = "block";
        })
        .catch((err) => {
            console.error("❌ Error loading lesson:", err);
        });
}

closeBtn.addEventListener("click", () => {
    viewLessonModal.style.display = "none";
});

function attachCardListener(card, chapterID, lessonID) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
        openLessonModal(chapterID, lessonID);
    });
}

// ADDING OF CHAPTER

async function openAddChapterModal() {
    addChapterModal.style.display = "block";
}

async function closeAddChapterModal() {
    // Clear form
    chapterIdInput.value = "";
    chapterTitleField.value = "";
    chapterDescField.value = "";

    addChapterModal.style.display = "none";
}

// Show lesson fields dynamically when "Add Lesson" clicked
addLessonTrigger.addEventListener("click", () => {
    const lessonForm = document.createElement("div");
    lessonForm.classList.add("lesson-form");

    lessonForm.innerHTML = `
        <hr>
        <div class="form-group inline-label1">
            <label>Lesson No.</label>
            <input type="text" class="lesson-no form-control" placeholder="1">
        </div>
        <div class="form-group">
            <label>Lesson Title</label>
            <input type="text" class="lesson-title form-control" placeholder="Lesson Title">
        </div>
        <div class="form-group">
            <label>Lesson Description</label>
            <textarea class="lesson-desc form-control" rows="3" placeholder="Provide description"></textarea>
        </div>
        <div class="form-group">
            <label>Lesson Upload</label>
            <input type="file" accept=".pdf,.pptx" class="lesson-upload">
        </div>
    `;

    document.querySelector("#add-chapter-form").appendChild(lessonForm);
});

// Save Chapter (and lessons if any)
async function saveChapter() {
    try {
        const chapterLabel = chapterIdInput.value.trim();
        const chapterTitle = chapterTitleField.value.trim();
        const chapterDesc = chapterDescField.value.trim();

        if (!chapterLabel || !chapterTitle) {
            showAlert("Chapter No. and Title are required.", "warning");
            return;
        }

        // ✅ Save Chapter
        const chapterRef = await addDoc(collection(db, "chapters"), {
            chapterLabel: `Chapter ${chapterLabel}`,
            chapterTitle,
            chapterDesc,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        });

        // ✅ Save Lessons under Chapter (if any)
        const lessonForms = document.querySelectorAll(".lesson-form");
        for (let form of lessonForms) {
            const lessonNo = form.querySelector(".lesson-no").value.trim();
            const lessonTitle = form.querySelector(".lesson-title").value.trim();
            const lessonDesc = form.querySelector(".lesson-desc").value.trim();
            const file = form.querySelector(".lesson-upload").files[0];

            if (!lessonNo || !lessonTitle) continue; // skip incomplete lessons

            // Build base lesson data
            let lessonData = {
                lessonLabel: `Lesson ${lessonNo}`,
                lessonTitle,
                lessonDesc,
                createdBy: currentUser.uid,
                createdAt: serverTimestamp(),
                fileName: file ? file.name : null,
                slides: {}
            };

            const lessonRef = await addDoc(
                collection(db, "chapters", chapterRef.id, "lessons"),
                lessonData
            );

            // If file uploaded → render + upload slides
            if (file) {
                let arrayBuffer;
                if (file.type === "application/pdf") {
                    arrayBuffer = await file.arrayBuffer();
                } else if (file.name.endsWith(".pptx")) {
                    arrayBuffer = await convertPPTXtoPDF(file);
                }

                const preview = document.createElement("div");
                const status = document.createElement("p");
                document.body.appendChild(preview);
                document.body.appendChild(status);

                const slidesMap = await renderPDFAndUpload(arrayBuffer, file.name, preview, status);

                await updateDoc(lessonRef, {
                    slides: slidesMap,
                    fileName: file.name
                });
            }
        }

        showAlert("Chapter and lessons saved successfully!", "success");

        // Clear form
        chapterIdInput.value = "";
        chapterTitleField.value = "";
        chapterDescField.value = "";

        closeAddChapterModal();

    } catch (err) {
        console.error("❌ Error saving chapter + lessons:", err);
        showAlert("❌ Failed to save. Check console for details.", "error");
    }
}

// ADDING OF LESSONS

async function openAddLessonModal() {
    addLessonModal.style.display = "block";
    loadAddLessonChapters();
}

async function closeAddLessonModal() {
    // Clear form
    lessonIdInput.value = "";
    lessonTitleInput.value = "";
    lessonDescInput.value = "";
    addLessonChapterInput.value = "";
    lessonUpload.value = "";

    status.textContent = "";
    preview.innerHTML = "";

    addLessonModal.style.display = "none";
}

async function loadAddLessonChapters() {
    const addLessonChapterInput = document.getElementById("add-lesson-chapter-input");
    addLessonChapterInput.innerHTML = "";

    try {
        const chaptersSnapshot = await getDocs(collection(db, "chapters"));

        if (chaptersSnapshot.empty) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No Chapters Found";
            option.disabled = true;
            option.selected = true;
            addLessonChapterInput.appendChild(option);
            addLessonChapterInput.disabled = true;
            return;
        }

        addLessonChapterInput.disabled = false;

        // Default option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "-- Select a Chapter --";
        defaultOption.selected = true;
        addLessonChapterInput.appendChild(defaultOption);

        // Convert snapshot to array for sorting
        let chapters = chaptersSnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                label: data.chapterLabel, // might be undefined
                title: data.chapterTitle || ""
            };
        });

        // Sort chapters numerically (using label if available, otherwise doc ID)
        chapters.sort((a, b) => {
            const numA = parseInt((a.label || a.id).replace(/\D/g, "")) || 0;
            const numB = parseInt((b.label || b.id).replace(/\D/g, "")) || 0;
            return numA - numB;
        });

        // Append options
        chapters.forEach((chapter) => {
            const option = document.createElement("option");

            option.value = chapter.id;

            const displayLabel = chapter.label || `Chapter ${chapter.id}`;
            option.textContent = displayLabel + (chapter.title ? ` - ${chapter.title}` : "");

            addLessonChapterInput.appendChild(option);
        });

    } catch (error) {
        console.error("❌ Error loading chapters for add lesson modal:", error);
    }
}

async function saveLesson() {
    try {
        // Values from form
        const lessonNo = lessonIdInput.value.trim();
        const lessonTitle = lessonTitleInput.value.trim();
        const lessonDesc = lessonDescInput.value.trim();
        const selectedChapterValue = addLessonChapterInput.value;
        const file = lessonUpload.files[0]; //  File input

        if (!selectedChapterValue) {
            showAlert("Please select a chapter first.", "warning");
            return;
        }
        if (!lessonNo || !lessonTitle) {
            showAlert("Please fill out Lesson No. and Title.", "warning");
            return;
        }

        //  Resolve Chapter ID
        let chapterIdToUse = null;
        const chaptersSnapshot = await getDocs(collection(db, "chapters"));
        chaptersSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.chapterLabel === selectedChapterValue || docSnap.id === selectedChapterValue) {
                chapterIdToUse = docSnap.id;
            }
        });

        if (!chapterIdToUse) {
            showAlert("Could not find the selected chapter.", "error");
            return;
        }

        //  Base lesson data
        const lessonData = {
            lessonLabel: `Lesson ${lessonNo}`,
            lessonTitle,
            lessonDesc,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp(),
            fileName: file ? file.name : null, // store filename if exists
            slides: {} // will be updated later if file uploaded
        };

        //  Create lesson document first
        const lessonRef = await addDoc(collection(db, "chapters", chapterIdToUse, "lessons"), lessonData);

        //  If file is uploaded, process and update
        if (file) {

            status.textContent = "Processing file...";
            preview.innerHTML = "";

            let arrayBuffer;
            if (file.type === "application/pdf") {
                arrayBuffer = await file.arrayBuffer();
            } else if (
                file.name.endsWith(".pptx") ||
                file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            ) {
                status.textContent = "Converting PPTX to PDF...";
                arrayBuffer = await convertPPTXtoPDF(file);
            } else {
                status.textContent = "Unsupported file type.";
                return;
            }

            //  Convert PDF → images, upload to Cloudinary, return slides map
            const slidesMap = await renderPDFAndUpload(arrayBuffer, file.name, preview, status);

            const fileUrl = await uploadFileToCloudinary(file);

            // update the lesson doc with slides + fileUrl
            await updateDoc(lessonRef, {
                slides: slidesMap,
                fileName: file.name,
                fileUrl: fileUrl
            });
        }

        showAlert("Lesson added successfully!", "success");

        // Clear form
        lessonIdInput.value = "";
        lessonTitleInput.value = "";
        lessonDescInput.value = "";
        addLessonChapterInput.value = "";
        lessonUpload.value = "";

        status.textContent = "";
        preview.innerHTML = "";

        // Close modal
        closeAddLessonModal();

    } catch (error) {
        console.error("❌ Error saving lesson:", error);
        showAlert("❌ Failed to save lesson. Check console for details.", "error");
    }
}

lessonUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    status.textContent = "Rendering preview...";
    preview.innerHTML = "";

    try {
        let arrayBuffer;

        if (file.type === "application/pdf") {
            arrayBuffer = await file.arrayBuffer();
        } else if (
            file.name.endsWith(".pptx") ||
            file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ) {
            status.textContent = "Converting PPTX to PDF for preview...";
            arrayBuffer = await convertPPTXtoPDF(file);
        } else {
            status.textContent = "Unsupported file type.";
            return;
        }

        //  Render preview thumbnails only (no Cloudinary upload yet)
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        status.textContent = `Preview loaded. Total pages: ${pdf.numPages}`;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 }); // smaller scale for preview

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: context, viewport }).promise;

            const thumb = document.createElement("img");
            thumb.src = canvas.toDataURL("image/jpeg", 0.8);
            thumb.style.maxWidth = "190px";
            thumb.style.border = "1px solid #ccc";
            thumb.style.borderRadius = "4px";
            preview.appendChild(thumb);
        }

        status.textContent = "Preview ready (file will upload when you save).";
    } catch (err) {
        console.error(err);
        status.textContent = "❌ Error generating preview: " + err.message;
    }
});

// CONVERTING OF PDF TO IMAGES FOR LESSONS

async function convertPPTXtoPDF(file) {
    const apiKey = "DH1Hl9xLEW3TS1Drw0RK6i3HQXuIduzS";
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`https://v2.convertapi.com/convert/pptx/to/pdf?Secret=${apiKey}`, {
        method: "POST",
        body: formData,
    });

    const result = await res.json();
    if (!result.Files || !result.Files[0]) throw new Error("ConvertAPI returned no file.");

    const fileData = result.Files[0].FileData;
    if (!fileData) throw new Error("No FileData found in ConvertAPI response.");

    const binaryString = atob(fileData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    return bytes.buffer;
}

async function renderPDFAndUpload(arrayBuffer, fileName, status) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    status.textContent = `PDF loaded. Total pages: ${pdf.numPages}`;

    const slidesMap = {};

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        status.textContent = `Uploading page ${pageNum} of ${pdf.numPages}...`;

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;

        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const cloudinaryUrl = await uploadToCloudinary(dataUrl, pageNum);

        slidesMap[pageNum] = cloudinaryUrl;
    }

    status.textContent = " Upload complete!";
    return slidesMap;
}

async function uploadToCloudinary(base64Image, pageNum) {
    const formData = new FormData();
    formData.append("file", base64Image);
    formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
    if (CLOUDINARY_CONFIG.folder) formData.append("folder", CLOUDINARY_CONFIG.folder);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/upload`, {
        method: "POST",
        body: formData,
    });

    const data = await res.json();
    if (!data.secure_url) throw new Error("Cloudinary upload failed");

    console.log(` Uploaded slide ${pageNum}:`, data.secure_url);
    return data.secure_url;
}

async function uploadFileToCloudinary(file) {
    // Use the "auto" endpoint so Cloudinary accepts raw files (pdf, pptx)
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
    // optional: put original files in a separate folder
    if (CLOUDINARY_CONFIG.folder) fd.append("folder", `${CLOUDINARY_CONFIG.folder}/originals`);

    const res = await fetch(url, { method: "POST", body: fd });
    const data = await res.json();
    console.log("Cloudinary (file) upload response:", data);

    if (data.error) throw new Error(data.error.message || "Cloudinary upload error");
    if (!data.secure_url) throw new Error("Cloudinary did not return a secure_url");

    // data.resource_type should be 'raw' or 'auto' for PDFs/PPTX
    return data.secure_url;
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

window.openAddChapterModal = openAddChapterModal
window.closeAddChapterModal = closeAddChapterModal
window.saveChapter = saveChapter
window.openAddLessonModal = openAddLessonModal
window.closeAddLessonModal = closeAddLessonModal
window.saveLesson = saveLesson

if (typeof window !== "undefined") {
    // Ensure DOM is loaded before attaching functions
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attachGlobalFunctions)
    } else {
        attachGlobalFunctions()
    }
}

function attachGlobalFunctions() {
    window.openAddChapterModal = openAddChapterModal
    window.closeAddChapterModal = closeAddChapterModal
    window.saveChapter = saveChapter
    window.openAddLessonModal = openAddLessonModal
    window.closeAddLessonModal = closeAddLessonModal
    window.saveLesson = saveLesson
}