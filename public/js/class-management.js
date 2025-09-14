// Class Management JavaScript
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
const classesTable = document.getElementById("classes-table")
const classesTbody = document.getElementById("classes-tbody")
const searchInput = document.getElementById("search-input")
const emptyState = document.getElementById("empty-state")

// Stats Elements
const totalClassesElement = document.getElementById("total-classes")
const totalStudentsElement = document.getElementById("total-students")
const activeClassesElement = document.getElementById("active-classes")

// Modal Elements
const addClassModal = document.getElementById("add-class-modal")
const editClassModal = document.getElementById("edit-class-modal")
const viewStudentsModal = document.getElementById("view-students-modal")
const deleteModal = document.getElementById("delete-modal")
const bulkDeleteModal = document.getElementById("bulk-delete-modal")
const alertElement = document.getElementById("alert")

// Bulk action elements
const bulkActionsElement = document.getElementById("bulk-actions")
const selectedCountElement = document.getElementById("selected-count")

// Current class being edited or deleted
let currentClassId = null
let classes = []
let filteredClasses = []
let currentUser = null
let adminProfile = null
const selectedClasses = new Set()

// Check if user is authenticated
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user
      // Load admin profile first
      await loadAdminProfile()
      // User is signed in, load classes
      loadClasses()
      loadStats()
      setupEventListeners()
    } else {
      // User is not signed in, redirect to login page
      window.location.href = "../index.html"
    }
  })

  // Auto-uppercase for class name input
  const classNameInput = document.getElementById("class-name")
  if (classNameInput) {
    classNameInput.addEventListener("input", function () {
      this.value = this.value.toUpperCase()
    })
  }

  const editClassNameInput = document.getElementById("edit-class-name")
  if (editClassNameInput) {
    editClassNameInput.addEventListener("input", function () {
      this.value = this.value.toUpperCase()
    })
  }
})

// Setup event listeners
function setupEventListeners() {
  // Add search functionality
  searchInput.addEventListener("input", filterClasses)

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
  currentClassId = null
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

// Load classes from Firestore (only for current admin)
async function loadClasses() {
  try {
    showLoading()

    // Query classes created by current admin only
    const classesQuery = query(collection(db, "classes"), where("createdBy", "==", currentUser.uid))

    const classesSnapshot = await getDocs(classesQuery)

    // Clear existing data
    classes = []

    if (classesSnapshot.empty) {
      // No classes found
      hideLoading()
      showEmptyState()
      clearSelection()
      return
    }

    // Add each class to the array
    classesSnapshot.forEach((docSnapshot) => {
      const classData = docSnapshot.data()
      classData.id = docSnapshot.id
      classes.push(classData)
    })

    // Apply current filter
    filteredClasses = [...classes]
    displayClasses()
  } catch (error) {
    console.error("Error loading classes:", error)
    showAlert("Error loading classes. Please try again.", "error")
    hideLoading()
  }
}

// Show loading state
function showLoading() {
  loadingElement.style.display = "block"
  classesTable.style.display = "none"
  emptyState.style.display = "none"
}

// Hide loading state
function hideLoading() {
  loadingElement.style.display = "none"
}

// Show empty state
function showEmptyState() {
  emptyState.style.display = "block"
  classesTable.style.display = "none"
}

// Helper: Fetch admin profiles for a list of UIDs
async function getAdminProfilesByUids(uids) {
  const adminProfiles = {}
  const uniqueUids = [...new Set(uids)]
  const adminDocs = await Promise.all(
    uniqueUids.map(uid => getDoc(doc(db, "admins", uid)))
  )
  adminDocs.forEach((docSnap, idx) => {
    if (docSnap.exists()) {
      adminProfiles[uniqueUids[idx]] = docSnap.data()
    }
  })
  return adminProfiles
}

// Display classes in table (fetch student count and instructor name dynamically)
async function displayClasses() {
  hideLoading()

  if (filteredClasses.length === 0) {
    showEmptyState()
    clearSelection()
    return
  }

  emptyState.style.display = "none"
  classesTable.style.display = "table"

  // Clear existing rows
  classesTbody.innerHTML = ""

  // Gather all unique createdBy UIDs
  const uids = filteredClasses.map(c => c.createdBy)
  const adminProfiles = await getAdminProfilesByUids(uids)

  // Add each class to the table, fetch student count for each
  for (const classData of filteredClasses) {
    // const studentsQuery = query(collection(db, "classes", classData.id, "students"))
    const studentsQuery = query(
      collection(db, "classes", classData.id, "students"),
      where("status", "==", "active")
    )
    const studentsSnapshot = await getDocs(studentsQuery)
    const studentCount = studentsSnapshot.size

    // Get instructor name or fallback to email
    let instructorDisplay = "N/A"
    const adminProfile = adminProfiles[classData.createdBy]
    if (adminProfile) {
      instructorDisplay = adminProfile.name || adminProfile.email || "N/A"
    } else {
      instructorDisplay = classData.createdByEmail || "N/A"
    }

    const row = document.createElement("tr")
    row.className = "class-row"
    const createdAt = classData.createdAt ? new Date(classData.createdAt.toDate()).toLocaleDateString() : "N/A"
    const classKey = classData.id
    const isSelected = selectedClasses.has(classKey)

    row.innerHTML = `
      <td>
        <input type="checkbox" class="class-checkbox" 
               ${isSelected ? "checked" : ""} 
               onchange="toggleClassSelection('${classData.id}', this)">
      </td>
      <td>${classData.className}</td>
      <td><span class="class-code">${classData.classCode}</span></td>
      <td>${studentCount} <span class="badge badge-primary">Students</span></td>
      <td class="hide-mobile">${createdAt}</td>
      <td class="action-buttons">
        <button class="btn-icon view" title="View Students" onclick="openViewStudentsModal('${classData.id}')">
          <i class="fas fa-users"></i>
        </button>
        <button class="btn-icon edit" title="Edit Class" onclick="openEditClassModal('${classData.id}')">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-icon delete" title="Delete Class" onclick="openDeleteModal('${classData.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `
    if (isSelected) {
      row.classList.add("selected")
    }
    classesTbody.appendChild(row)
  }

  updateBulkActionsVisibility()
  updateSelectAllState()
}

// Update createClassRow to accept studentCount as parameter
// function createClassRow(classData, studentCount = 0) {
//   const row = document.createElement("tr")
//   row.className = "class-row"

//   // Format date
//   const createdAt = classData.createdAt ? new Date(classData.createdAt.toDate()).toLocaleDateString() : "N/A"

//   const classKey = classData.id
//   const isSelected = selectedClasses.has(classKey)

//   row.innerHTML = `
//         <td>
//             <input type="checkbox" class="class-checkbox" 
//                    ${isSelected ? "checked" : ""} 
//                    onchange="toggleClassSelection('${classData.id}', this)">
//         </td>
//         <td>${classData.className}</td>
//         <td><span class="class-code">${classData.classCode}</span></td>
//         <td>${studentCount} <span class="badge badge-primary">Students</span></td>
//         <td class="hide-mobile">${createdAt}</td>
//         <td class="action-buttons">
//             <button class="btn-icon view" title="View Students" onclick="openViewStudentsModal('${classData.id}')">
//                 <i class="fas fa-users"></i>
//             </button>
//             <button class="btn-icon edit" title="Edit Class" onclick="openEditClassModal('${classData.id}')">
//                 <i class="fas fa-edit"></i>
//             </button>
//             <button class="btn-icon delete" title="Delete Class" onclick="openDeleteModal('${classData.id}')">
//                 <i class="fas fa-trash"></i>
//             </button>
//         </td>
//     `

//   if (isSelected) {
//     row.classList.add("selected")
//   }

//   return row
// }

// Load statistics (only for current admin's classes)
async function loadStats() {
  try {
    // Get total classes for current admin
    const classesQuery = query(collection(db, "classes"), where("createdBy", "==", currentUser.uid))
    const classesSnapshot = await getDocs(classesQuery)
    totalClassesElement.textContent = classesSnapshot.size

    // Get active classes and total students
    let activeClasses = 0
    let totalStudents = 0

    // For each class, check if it has students
    for (const docSnapshot of classesSnapshot.docs) {
      const studentsQuery = query(collection(db, "classes", docSnapshot.id, "students"))
      const studentsSnapshot = await getDocs(studentsQuery)
      const studentCount = studentsSnapshot.size

      totalStudents += studentCount
      if (studentCount > 0) {
        activeClasses++
      }
    }

    activeClassesElement.textContent = activeClasses
    totalStudentsElement.textContent = totalStudents
  } catch (error) {
    console.error("Error loading stats:", error)
  }
}

// Create a table row for a class with checkbox
// function createClassRow(classData) {
//   const row = document.createElement("tr")
//   row.className = "class-row"

//   // Format date
//   const createdAt = classData.createdAt ? new Date(classData.createdAt.toDate()).toLocaleDateString() : "N/A"

//   // Student count
//   const studentCount = classData.studentCount || 0

//   const classKey = classData.id
//   const isSelected = selectedClasses.has(classKey)

//   row.innerHTML = `
//         <td>
//             <input type="checkbox" class="class-checkbox" 
//                    ${isSelected ? "checked" : ""} 
//                    onchange="toggleClassSelection('${classData.id}', this)">
//         </td>
//         <td>${classData.className}</td>
//         <td><span class="class-code">${classData.classCode}</span></td>
//         <td>${studentCount} <span class="badge badge-primary">Students</span></td>
//         <td class="hide-mobile">${createdAt}</td>
//         <td class="action-buttons">
//             <button class="btn-icon view" title="View Students" onclick="openViewStudentsModal('${classData.id}')">
//                 <i class="fas fa-users"></i>
//             </button>
//             <button class="btn-icon edit" title="Edit Class" onclick="openEditClassModal('${classData.id}')">
//                 <i class="fas fa-edit"></i>
//             </button>
//             <button class="btn-icon delete" title="Delete Class" onclick="openDeleteModal('${classData.id}')">
//                 <i class="fas fa-trash"></i>
//             </button>
//         </td>
//     `

//   if (isSelected) {
//     row.classList.add("selected")
//   }

//   return row
// }

// Bulk Selection Functions
function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById("select-all")
  const classCheckboxes = document.querySelectorAll(".class-checkbox")

  if (selectAllCheckbox.checked) {
    // Select all visible classes
    filteredClasses.forEach((classData) => {
      selectedClasses.add(classData.id)
    })
    classCheckboxes.forEach((checkbox) => {
      checkbox.checked = true
      checkbox.closest("tr").classList.add("selected")
    })
  } else {
    // Deselect all
    selectedClasses.clear()
    classCheckboxes.forEach((checkbox) => {
      checkbox.checked = false
      checkbox.closest("tr").classList.remove("selected")
    })
  }

  updateBulkActionsVisibility()
}

function toggleClassSelection(classId, checkbox) {
  const row = checkbox.closest("tr")

  if (checkbox.checked) {
    selectedClasses.add(classId)
    row.classList.add("selected")
  } else {
    selectedClasses.delete(classId)
    row.classList.remove("selected")
    document.getElementById("select-all").checked = false
  }

  updateBulkActionsVisibility()
  updateSelectAllState()
}

function updateSelectAllState() {
  const selectAllCheckbox = document.getElementById("select-all")
  const visibleClassIds = filteredClasses.map((c) => c.id)
  const selectedVisibleCount = visibleClassIds.filter((id) => selectedClasses.has(id)).length

  if (selectedVisibleCount === 0) {
    selectAllCheckbox.indeterminate = false
    selectAllCheckbox.checked = false
  } else if (selectedVisibleCount === visibleClassIds.length) {
    selectAllCheckbox.indeterminate = false
    selectAllCheckbox.checked = true
  } else {
    selectAllCheckbox.indeterminate = true
    selectAllCheckbox.checked = false
  }
}

function updateBulkActionsVisibility() {
  const selectedCount = selectedClasses.size

  if (selectedCount > 0) {
    bulkActionsElement.style.display = "flex"
    selectedCountElement.textContent = `${selectedCount} selected`

    // Update delete button info
    // const deleteCountInfo = document.getElementById("delete-count-info")
    // deleteCountInfo.textContent = `(${selectedCount})`
  } else {
    bulkActionsElement.style.display = "none"
  }
}

function clearSelection() {
  selectedClasses.clear()
  document.querySelectorAll(".class-checkbox").forEach((checkbox) => {
    checkbox.checked = false
    checkbox.closest("tr").classList.remove("selected")
  })
  document.getElementById("select-all").checked = false
  updateBulkActionsVisibility()
}

function getSelectedClasses() {
  return Array.from(selectedClasses)
    .map((classId) => classes.find((c) => c.id === classId))
    .filter(Boolean)
}

// Filter classes based on search input
function filterClasses() {
  const searchTerm = searchInput.value.toLowerCase()

  // Filter classes
  filteredClasses = classes.filter(
    (classData) =>
      classData.className.toLowerCase().includes(searchTerm) ||
      (classData.instructorName && classData.instructorName.toLowerCase().includes(searchTerm)) ||
      classData.classCode.toLowerCase().includes(searchTerm),
  )

  displayClasses()
}

// Generate Class Code
function generateClassCode() {
  // Format: CQ + 6 alphanumeric characters
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = "CQ"

  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return code
}

// Open Add Class Modal
function openAddClassModal() {
  // Generate and set Class Code
  document.getElementById("class-code").value = generateClassCode()

  const classCode = document.getElementById("class-code").value;
  generateClassQR(classCode);


  // Clear form fields
  document.getElementById("class-name").value = ""
  document.getElementById("admin-password").value = ""

  // Auto-fill instructor name from admin profile
  if (adminProfile && adminProfile.name) {
    document.getElementById("instructor-name").value = adminProfile.name
  } else {
    document.getElementById("instructor-name").value = ""
  }

  // Show modal
  addClassModal.style.display = "block"
}

// Close Add Class Modal
function closeAddClassModal() {
  addClassModal.style.display = "none"
}

// Add new class
async function addClass() {
  // Get form values
  const className = document.getElementById("class-name").value.trim()
  const instructorName = document.getElementById("instructor-name").value.trim()
  const classCode = document.getElementById("class-code").value
  const adminPassword = document.getElementById("admin-password").value

  // Validate form
  if (!className || !instructorName || !adminPassword) {
    showAlert("Please fill in all fields.", "error")
    return
  }

  // Disable button to prevent multiple submissions
  const addButton = document.getElementById("add-class-btn")
  addButton.disabled = true
  addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'


  try {
    // Re-authenticate current user to verify password
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    // Check if class code already exists
    const codeCheckQuery = query(collection(db, "classes"), where("classCode", "==", classCode))
    const codeCheck = await getDocs(codeCheckQuery)

    if (!codeCheck.empty) {
      // Generate a new code if this one already exists
      const newCode = generateClassCode()
      document.getElementById("class-code").value = newCode
      showAlert("Generated a new class code due to conflict.", "warning")

      // Re-enable button
      addButton.disabled = false
      addButton.innerHTML = "Create Class"
      return
    }

    // Add class to Firestore (remove studentCount)
    await addDoc(collection(db, "classes"), {
      className: className,
      classCode: classCode,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid,
      createdByEmail: currentUser.email,
      isActive: true,
    })

    // Log the action
    await addDoc(collection(db, "activity_logs"), {
      action: "Create class",
      description: `Class "${classCode}" created by ` + currentUser.email,
      className: `${className}`,
      classCode: classCode,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    // Close modal and reload classes
    closeAddClassModal()
    showAlert(`Class "${className}" created successfully with code: ${classCode}`, "success")
    loadClasses()
    loadStats()
  } catch (error) {
    console.error("Error adding class:", error)

    let errorMessage = "Error creating class."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    addButton.disabled = false
    addButton.innerHTML = "Create Class"
  }
}
let qrCodeInstance = null;

function generateClassQR(code) {
  console.log("📌 generateClassQR CALLED with:", code);

  const qrContainer = document.getElementById("class-qr");
  if (!qrContainer) {
    console.error("❌ No element with id='class-qr' found in DOM");
    return;
  }

  qrContainer.innerHTML = "";

  try {
    new QRCode(qrContainer, {
      text: code,
      width: 200,
      height: 200,
      correctLevel: QRCode.CorrectLevel.H
    });
    console.log("✅ QR generated successfully");
  } catch (err) {
    console.error("❌ QRCode error:", err);
  }
}

// Open Edit Class Modal
async function openEditClassModal(classId) {
  try {
    currentClassId = classId

    // Get class data
    const classDoc = await getDoc(doc(db, "classes", classId))

    if (classDoc.exists) {
      const classData = classDoc.data()

      // Fill form fields
      document.getElementById("edit-class-id").value = classId
      document.getElementById("edit-class-name").value = classData.className || ""
      document.getElementById("edit-instructor-name").value = adminProfile.name || ""
      document.getElementById("edit-class-code").value = classData.classCode || ""
      document.getElementById("edit-admin-password").value = ""

      // Show modal
      editClassModal.style.display = "block"
    } else {
      showAlert("Class not found.", "error")
    }
  } catch (error) {
    console.error("Error opening edit modal:", error)
    showAlert("Error loading class details.", "error")
  }
}

// Close Edit Class Modal
function closeEditClassModal() {
  editClassModal.style.display = "none"
  currentClassId = null
}

// Update class
async function updateClass() {
  if (!currentClassId) return

  // Get form values
  const className = document.getElementById("edit-class-name").value.trim()
  const instructorName = document.getElementById("edit-instructor-name").value.trim()
  const adminPassword = document.getElementById("edit-admin-password").value

  // Validate form
  if (!className || !instructorName || !adminPassword) {
    showAlert("Please fill in all fields.", "error")
    return
  }

  // Disable button to prevent multiple submissions
  const editButton = document.getElementById("edit-class-btn")
  editButton.disabled = true
  editButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...'


  try {
    // Re-authenticate current user to verify password
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    // Update class in Firestore
    await updateDoc(doc(db, "classes", currentClassId), {
      className: className,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid,
    })

    // Log the action
    await addDoc(collection(db, "activity_logs"), {
      action: "Update class",
      description: `Class "${className}" updated by ` + currentUser.email,
      className: `${className}`,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    // Close modal and reload classes
    closeEditClassModal()
    showAlert("Class updated successfully.", "success")
    loadClasses()
  } catch (error) {
    console.error("Error updating class:", error)

    let errorMessage = "Error updating class."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    editButton.disabled = false
    editButton.innerHTML = "Update Class"
  }
}

// Open View Students Modal
async function openViewStudentsModal(classId) {
  try {
    currentClassId = classId

    // Show loading
    document.getElementById("students-loading").style.display = "block"
    document.getElementById("students-container").style.display = "none"

    // Get class data
    const classDoc = await getDoc(doc(db, "classes", classId))

    if (classDoc.exists) {
      const classData = classDoc.data()

      // Set class details
      document.getElementById("view-class-name").textContent = classData.className
      document.getElementById("view-class-code").textContent = classData.classCode

      // Get students
      // const studentsQuery = query(collection(db, "classes", classId, "students"))
      const studentsQuery = query(
        collection(db, "classes", classId, "students"),
        where("status", "==", "active")
      )
      const studentsSnapshot = await getDocs(studentsQuery)
      const studentList = document.getElementById("student-list")

      // Clear existing students
      studentList.innerHTML = ""

      // Set student count
      document.getElementById("student-count").textContent = studentsSnapshot.size

      if (studentsSnapshot.empty) {
        // No students
        studentList.innerHTML = '<li class="no-students">No students enrolled in this class yet.</li>'
      } else {
        // Add each student to the list
        studentsSnapshot.forEach((docSnapshot) => {
          const student = docSnapshot.data()
          const studentItem = createStudentItem(student)
          studentList.appendChild(studentItem)
        })
      }

      // Hide loading and show students
      document.getElementById("students-loading").style.display = "none"
      document.getElementById("students-container").style.display = "block"

      const qrContainer = document.getElementById("edit-class-qr");
      qrContainer.innerHTML = "";
      if (classData.classCode) {
        console.log("📌 Generating QR for:", classData.classCode);
        new QRCode(qrContainer, {
          text: classData.classCode,
          width: 128,
          height: 128
        });
      }

      const downloadBtn = document.getElementById("download-qr-btn");
      downloadBtn.onclick = () => {
        const img = qrContainer.querySelector("img");
        if (!img) {
          console.error("⚠️ QR image not found!");
          return;
        }
        const link = document.createElement("a");
        link.href = img.src;
        link.download = `${classData.classCode}_QR.png`;
        link.click();
      };

      // Show modal
      viewStudentsModal.style.display = "block"
    } else {
      showAlert("Class not found.", "error")
    }
  } catch (error) {
    console.error("Error opening view students modal:", error)
    showAlert("Error loading students.", "error")
  }
}

// Create a student list item
function createStudentItem(student) {
  const item = document.createElement("li")
  item.className = "student-item"

  // Get initials for avatar
  const name = student.name || "Unknown Student"
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()

  item.innerHTML = `
        <div class="student-avatar">${initials}</div>
        <div class="student-info">
            <div class="student-name">${student.name}</div>
            <div class="student-email">${student.email || "No email"}</div>
            <div class="student-progress">Progress: ${student.progress || "0"}%</div>
        </div>
    `

  return item
}

// Close View Students Modal
function closeViewStudentsModal() {
  viewStudentsModal.style.display = "none"
  currentClassId = null
}

// Copy class code to clipboard
function copyClassCode() {
  const codeElement = document.getElementById("view-class-code")
  const code = codeElement.textContent

  navigator.clipboard
    .writeText(code)
    .then(() => {
      showAlert("Class code copied to clipboard!", "success")
    })
    .catch((err) => {
      console.error("Could not copy text: ", err)
      showAlert("Failed to copy class code.", "error")
    })
}

// Open Delete Modal
async function openDeleteModal(classId) {
  try {
    currentClassId = classId

    // Get class data
    const classDoc = await getDoc(doc(db, "classes", classId))

    if (classDoc.exists) {
      const classData = classDoc.data()

      // Set class name
      document.getElementById("delete-class-name").textContent = classData.className
      document.getElementById("delete-admin-password").value = ""

      // Show modal
      deleteModal.style.display = "block"
    } else {
      showAlert("Class not found.", "error")
    }
  } catch (error) {
    console.error("Error opening delete modal:", error)
    showAlert("Error loading class details.", "error")
  }
}

// Close Delete Modal
function closeDeleteModal() {
  deleteModal.style.display = "none"
  currentClassId = null
}

// Delete class
async function deleteClass() {
  if (!currentClassId) return

  const adminPassword = document.getElementById("delete-admin-password").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  // Disable button to prevent multiple submissions
  const deleteButton = document.getElementById("delete-class-btn")
  deleteButton.disabled = true
  deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'


  try {
    // Re-authenticate current user to verify password
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    // Get class data for logging
    const classDoc = await getDoc(doc(db, "classes", currentClassId))
    const classData = classDoc.data()

    // Delete all students in the class
    const studentsQuery = query(collection(db, "classes", currentClassId, "students"))
    const studentsSnapshot = await getDocs(studentsQuery)

    // Batch delete students
    const batchDelete = writeBatch(db)
    studentsSnapshot.forEach((docSnapshot) => {
      batchDelete.delete(docSnapshot.ref)
    })

    // Delete the class
    batchDelete.delete(doc(db, "classes", currentClassId))

    // Commit the batch
    await batchDelete.commit()

    // Log the action
    await addDoc(collection(db, "activity_logs"), {
      action: "Delete class",
      description: `Class "${classData.className}" deleted by ` + currentUser.email,
      className: classData.className,
      classCode: classData.classCode,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    // Close modal and reload classes
    closeDeleteModal()
    showAlert("Class deleted successfully.", "success")
    loadClasses()
    loadStats()
  } catch (error) {
    console.error("Error deleting class:", error)

    let errorMessage = "Error deleting class."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    deleteButton.disabled = false
    deleteButton.innerHTML = "Delete Class"
  }
}

// Bulk Delete Functions
function openBulkDeleteModal() {
  const selectedCount = selectedClasses.size
  if (selectedCount === 0) {
    showAlert("Please select classes to delete.", "warning")
    return
  }

  document.getElementById("bulk-delete-count").textContent = selectedCount
  document.getElementById("admin-password-bulk-delete").value = ""
  bulkDeleteModal.style.display = "block"
}

function closeBulkDeleteModal() {
  bulkDeleteModal.style.display = "none"
}

async function confirmBulkDelete() {
  const adminPassword = document.getElementById("admin-password-bulk-delete").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmBtn = document.getElementById("confirm-bulk-delete-btn")
  confirmBtn.disabled = true
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'


  try {
    // Verify admin password
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)
    await reauthenticateWithCredential(currentUser, credential)

    const classesToDelete = getSelectedClasses()
    const batch = writeBatch(db)

    // Delete each selected class and its students
    for (const classData of classesToDelete) {
      // Delete all students in the class
      // const studentsQuery = query(collection(db, "classes", classData.id, "students"))
      const studentsQuery = query(
        collection(db, "classes", classData.id, "students"),
        where("status", "==", "active")
      )
      const studentsSnapshot = await getDocs(studentsQuery)

      studentsSnapshot.forEach((docSnapshot) => {
        batch.delete(docSnapshot.ref)
      })

      // Delete the class
      batch.delete(doc(db, "classes", classData.id))
    }

    // Commit the batch
    await batch.commit()

    // Log the bulk action
    await addDoc(collection(db, "activity_logs"), {
      action: "Bulk delete classes",
      description: `Deleted ${classesToDelete.length} classes by ` + currentUser.email,
      classCount: classesToDelete.length,
      classIds: classesToDelete.map((c) => c.id),
      classNames: classesToDelete.map((c) => c.className),
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    closeBulkDeleteModal()
    clearSelection()
    showAlert(`${classesToDelete.length} classes deleted successfully.`, "success")
    loadClasses()
    loadStats()
  } catch (error) {
    console.error("Error deleting classes:", error)

    let errorMessage = "Error deleting classes."
    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    confirmBtn.disabled = false
    confirmBtn.innerHTML = "Delete Classes"
  }
}

// Export classes to CSV (fetch student count dynamically)
async function exportClasses() {
  if (filteredClasses.length === 0) {
    showAlert("No classes to export.", "warning")
    return
  }

  const headers = ["Class Name", "Instructor", "Class Code", "Students", "Created Date"]
  const rows = []

  for (const classData of filteredClasses) {
    // const studentsQuery = query(collection(db, "classes", classData.id, "students"))
    const studentsQuery = query(
      collection(db, "classes", classData.id, "students"),
      where("status", "==", "active")
    )
    const studentsSnapshot = await getDocs(studentsQuery)
    const studentCount = studentsSnapshot.size

    rows.push([
      `"${classData.className || "Unknown"}"`,
      `"${classData.instructorName || "N/A"}"`,
      `"${classData.classCode || "N/A"}"`,
      `"${studentCount}"`,
      `"${classData.createdAt ? new Date(classData.createdAt.toDate()).toLocaleDateString() : "N/A"}"`,
    ].join(","))
  }

  const csvContent = [headers.join(","), ...rows].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv" })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `classes_${new Date().toISOString().split("T")[0]}.csv`
  a.click()
  window.URL.revokeObjectURL(url)

  showAlert("Classes exported successfully.", "success")
}

// Show alert message
function showAlert(message, type) {
  const alertElement = document.getElementById("alert")
  const alertMessage = document.getElementById("alert-message")

  alertElement.className = "alert " + type
  alertMessage.textContent = message
  alertElement.style.display = "flex"

  // Auto-hide after 5 seconds
  setTimeout(() => {
    closeAlert()
  }, 5000)
}

// Close alert
function closeAlert() {
  const alertElement = document.getElementById("alert")
  alertElement.classList.add("hiding")

  setTimeout(() => {
    alertElement.style.display = "none"
    alertElement.classList.remove("hiding")
  }, 300)
}

// Make functions globally available
window.openAddClassModal = openAddClassModal
window.closeAddClassModal = closeAddClassModal
window.addClass = addClass
window.openEditClassModal = openEditClassModal
window.closeEditClassModal = closeEditClassModal
window.updateClass = updateClass
window.openViewStudentsModal = openViewStudentsModal
window.closeViewStudentsModal = closeViewStudentsModal
window.copyClassCode = copyClassCode
window.openDeleteModal = openDeleteModal
window.closeDeleteModal = closeDeleteModal
window.deleteClass = deleteClass
window.closeAlert = closeAlert
window.exportClasses = exportClasses

// Bulk operation functions
window.toggleSelectAll = toggleSelectAll
window.toggleClassSelection = toggleClassSelection
window.clearSelection = clearSelection
window.openBulkDeleteModal = openBulkDeleteModal
window.closeBulkDeleteModal = closeBulkDeleteModal
window.confirmBulkDelete = confirmBulkDelete

// Also expose these functions immediately for HTML onclick handlers
if (typeof window !== "undefined") {
  // Ensure DOM is loaded before attaching functions
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachGlobalFunctions)
  } else {
    attachGlobalFunctions()
  }
}

function attachGlobalFunctions() {
  window.openAddClassModal = openAddClassModal
  window.closeAddClassModal = closeAddClassModal
  window.addClass = addClass
  window.openEditClassModal = openEditClassModal
  window.closeEditClassModal = closeEditClassModal
  window.updateClass = updateClass
  window.openViewStudentsModal = openViewStudentsModal
  window.closeViewStudentsModal = closeViewStudentsModal
  window.copyClassCode = copyClassCode
  window.openDeleteModal = openDeleteModal
  window.closeDeleteModal = closeDeleteModal
  window.deleteClass = deleteClass
  window.closeAlert = closeAlert
  window.exportClasses = exportClasses
  window.toggleSelectAll = toggleSelectAll
  window.toggleClassSelection = toggleClassSelection
  window.clearSelection = clearSelection
  window.openBulkDeleteModal = openBulkDeleteModal
  window.closeBulkDeleteModal = closeBulkDeleteModal
  window.confirmBulkDelete = confirmBulkDelete
}
