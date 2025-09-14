import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  addDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
import { auth, db } from "./firebase-config.js"
import { deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

// Initialize EmailJS - make sure this matches your EmailJS account
const EMAILJS_SERVICE_ID = "service_fxw9h0p"
const EMAILJS_TEMPLATE_ID = "template_dqnybw8"
const EMAILJS_PUBLIC_KEY = "prrfmOdZMuRUcna22"

// DOM Elements
const loadingElement = document.getElementById("loading")
const adminsTable = document.getElementById("admins-table")
const adminsTbody = document.getElementById("admins-tbody")
const searchInput = document.getElementById("search-input")
const statusFilter = document.getElementById("status-filter")
const selectAllCheckbox = document.getElementById("select-all-checkbox")
const bulkActionsBar = document.getElementById("bulk-actions-bar")
const selectedCountSpan = document.getElementById("selected-count")
const adminsCountSpan = document.getElementById("admins-count")
const noResultsDiv = document.getElementById("no-results")

// Modal Elements
const addAdminModal = document.getElementById("addAdminModal")
const confirmationModal = document.getElementById("confirmationModal")
const bulkConfirmationModal = document.getElementById("bulkConfirmationModal")
const adminDetailsModal = document.getElementById("adminDetailsModal")
const alertElement = document.getElementById("alert")

// Bulk action buttons
const bulkDeleteBtn = document.getElementById("bulk-delete-btn")
const bulkBlockBtn = document.getElementById("bulk-block-btn")
const bulkUnblockBtn = document.getElementById("bulk-unblock-btn")

// Current admin being edited or deleted
let currentAdminId = null
let currentAction = null
let currentBulkAction = null
let description = null
let allAdmins = []
let filteredAdmins = []
const selectedAdmins = new Set()

// Check if user is authenticated and is a Super Admin
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((user) => {
    if (user) {
      checkUserRole(user.uid)
    } else {
      // Redirect to login page if not authenticated
      window.location.href = "../index.html"
    }
  })

  // Add event listeners
  setupEventListeners()

  // Auto-capitalize each word in the Add Admin name input
  const adminNameInput = document.getElementById("admin-name")
  if (adminNameInput) {
    adminNameInput.addEventListener("input", function () {
      this.value = this.value.replace(/\b\w/g, (c) => c.toUpperCase())
    })
  }
})

// Setup event listeners
function setupEventListeners() {
  // Search functionality
  searchInput.addEventListener("input", debounce(filterAdmins, 300))

  // Status filter
  statusFilter.addEventListener("change", filterAdmins)

  // Select all checkbox
  selectAllCheckbox.addEventListener("change", handleSelectAll)

  // Bulk action buttons
  bulkDeleteBtn.addEventListener("click", () => handleBulkAction("delete"))
  bulkBlockBtn.addEventListener("click", () => handleBulkAction("block"))
  bulkUnblockBtn.addEventListener("click", () => handleBulkAction("unblock"))
}

// Debounce function for search
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

// Check if the user is a Super Admin
async function checkUserRole(userId) {
  try {
    const userDocRef = doc(db, "admins", userId)
    const userDoc = await getDoc(userDocRef)

    if (userDoc.exists() && userDoc.data().role === "Super Admin") {
      // User is a Super Admin, load admins
      loadAdmins()
    } else {
      // User is not a Super Admin, redirect to dashboard
      window.location.href = "../admin/dashboard.html"
    }
  } catch (error) {
    console.error("Error checking user role:", error)
    showAlert("Error verifying your access level. Check your internet connection.", "error")
  }
}

// Load all admins from Firestore
async function loadAdmins() {
  try {
    loadingElement.style.display = "block"
    adminsTable.style.display = "none"
    noResultsDiv.style.display = "none"

    const adminsRef = collection(db, "admins")
    const adminsQuery = query(adminsRef, where("role", "==", "Admin"))
    const adminsSnapshot = await getDocs(adminsQuery)

    allAdmins = []

    if (!adminsSnapshot.empty) {
      adminsSnapshot.forEach((doc) => {
        const admin = doc.data()
        allAdmins.push({
          id: doc.id,
          ...admin,
        })
      })
    }

    // Update statistics
    updateStatistics()

    // Filter and display admins
    filterAdmins()

    loadingElement.style.display = "none"
  } catch (error) {
    console.error("Error loading admins:", error)
    showAlert("Error loading admins. Please try again.", "error")
    loadingElement.style.display = "none"
  }
}

// Update statistics
function updateStatistics() {
  const stats = {
    total: allAdmins.length,
    active: allAdmins.filter((admin) => admin.authAccountCreated && admin.isActive).length,
    pending: allAdmins.filter((admin) => !admin.authAccountCreated).length,
    blocked: allAdmins.filter((admin) => admin.authAccountCreated && !admin.isActive).length,
  }

  document.getElementById("total-admins").textContent = stats.total
  document.getElementById("active-admins").textContent = stats.active
  document.getElementById("pending-admins").textContent = stats.pending
  document.getElementById("blocked-admins").textContent = stats.blocked
}

// Filter admins based on search and status
function filterAdmins() {
  const searchTerm = searchInput.value.toLowerCase().trim()
  const statusValue = statusFilter.value

  filteredAdmins = allAdmins.filter((admin) => {
    // Search filter
    const matchesSearch =
      !searchTerm ||
      admin.name.toLowerCase().includes(searchTerm) ||
      admin.email.toLowerCase().includes(searchTerm) ||
      (admin.adminId && admin.adminId.toLowerCase().includes(searchTerm))

    // Status filter
    let matchesStatus = true
    if (statusValue !== "all") {
      const adminStatus = getAdminStatus(admin)
      matchesStatus = adminStatus === statusValue
    }

    return matchesSearch && matchesStatus
  })

  displayAdmins()
  updateBulkActions()
}

// Get admin status
function getAdminStatus(admin) {
  if (!admin.authAccountCreated) {
    return "pending"
  } else if (admin.isActive) {
    return "active"
  } else {
    return "blocked"
  }
}

// Display filtered admins
function displayAdmins() {
  adminsTbody.innerHTML = ""
  adminsCountSpan.textContent = filteredAdmins.length

  if (filteredAdmins.length === 0) {
    adminsTable.style.display = "none"
    noResultsDiv.style.display = "block"
    return
  }

  filteredAdmins.forEach((admin) => {
    const adminRow = createAdminRow(admin)
    adminsTbody.appendChild(adminRow)
  })

  adminsTable.style.display = "table"
  noResultsDiv.style.display = "none"

  // Update select all checkbox
  updateSelectAllCheckbox()
}

// Create a table row for an admin
function createAdminRow(admin) {
  const row = document.createElement("tr")

  // Format date
  const createdAt = admin.createdAt ? new Date(admin.createdAt.toDate()).toLocaleDateString() : "N/A"

  // Status badge class - show different status for first login
  let statusClass, statusText
  const adminStatus = getAdminStatus(admin)

  switch (adminStatus) {
    case "pending":
      statusClass = "badge-intermediate"
      statusText = "Pending First Login"
      break
    case "active":
      statusClass = "badge-beginner"
      statusText = "Active"
      break
    case "blocked":
      statusClass = "badge-advanced"
      statusText = "Blocked"
      break
  }

  // Create avatar
  const avatarHtml = createAvatarHtml(admin)

  row.innerHTML = `
        <td class="checkbox-column">
            <input type="checkbox" class="admin-checkbox" data-admin-id="${admin.id}" ${selectedAdmins.has(admin.id) ? "checked" : ""}>
        </td>
        <td>
            <div class="admin-info">
                ${avatarHtml}
                <div class="admin-details">
                    <div class="admin-name" onclick="showAdminDetails('${admin.id}')">${admin.name}</div>
                    <div class="admin-email-mobile">${admin.email}</div>
                </div>
            </div>
        </td>
        <td class="desktop-only">${admin.adminId || "N/A"}</td>
        <td class="desktop-only">${admin.email}</td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td class="desktop-only">${createdAt}</td>
        <td style="text-align: center;">
            ${createActionButtons(admin)}
        </td>
    `

  // Add event listener for checkbox
  const checkbox = row.querySelector(".admin-checkbox")
  checkbox.addEventListener("change", handleAdminSelection)

  return row
}

// Create avatar HTML with click handler
function createAvatarHtml(admin) {
  const initials = getInitials(admin.name)

  if (admin.profileImage) {
    return `
            <div class="admin-avatar" onclick="showAdminDetails('${admin.id}')">
                <img src="${admin.profileImage}" alt="${admin.name}" onerror="this.style.display='none'; this.parentNode.innerHTML='${initials}';">
            </div>
        `
  } else {
    return `<div class="admin-avatar" onclick="showAdminDetails('${admin.id}')">${initials}</div>`
  }
}

// Get initials from name
function getInitials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2)
}

// Show admin details modal
async function showAdminDetails(adminId) {
  const admin = allAdmins.find((a) => a.id === adminId)
  if (!admin) return

  try {
    // Get additional details if needed
    const adminDoc = await getDoc(doc(db, "admins", adminId))
    const adminData = adminDoc.exists() ? adminDoc.data() : admin

    // Populate modal with admin details
    const avatarElement = document.getElementById("admin-details-avatar")
    const initials = getInitials(admin.name)

    if (admin.profileImage) {
      avatarElement.innerHTML = `<img src="${admin.profileImage}" alt="${admin.name}" onerror="this.innerHTML='${initials}';">`
    } else {
      avatarElement.textContent = initials
    }

    document.getElementById("admin-details-name").textContent = admin.name
    document.getElementById("admin-details-email").textContent = admin.email
    document.getElementById("admin-details-id").textContent = admin.adminId || "N/A"
    document.getElementById("admin-details-role").textContent = admin.role || "Admin"

    // Status badge
    const statusElement = document.getElementById("admin-details-status")
    const adminStatus = getAdminStatus(admin)
    let statusClass, statusText

    switch (adminStatus) {
      case "pending":
        statusClass = "badge-intermediate"
        statusText = "Pending First Login"
        break
      case "active":
        statusClass = "badge-beginner"
        statusText = "Active"
        break
      case "blocked":
        statusClass = "badge-advanced"
        statusText = "Blocked"
        break
    }

    statusElement.className = `badge ${statusClass}`
    statusElement.textContent = statusText

    // Dates
    const createdAt = admin.createdAt ? new Date(admin.createdAt.toDate()).toLocaleDateString() : "N/A"
    document.getElementById("admin-details-created").textContent = createdAt

    // Created by (you might need to fetch the creator's name)
    document.getElementById("admin-details-created-by").textContent = "Super Admin"

    // Show/hide blocked information
    const blockedSection = document.getElementById("admin-details-blocked-section")
    const blockedBySection = document.getElementById("admin-details-blocked-by-section")

    if (adminStatus === "blocked" && admin.blockedAt) {
      const blockedAt = new Date(admin.blockedAt.toDate()).toLocaleDateString()
      document.getElementById("admin-details-blocked").textContent = blockedAt
      document.getElementById("admin-details-blocked-by").textContent = admin.blockedBy || "N/A"
      blockedSection.style.display = "block"
      blockedBySection.style.display = "block"
    } else {
      blockedSection.style.display = "none"
      blockedBySection.style.display = "none"
    }

    // Last login (if available)
    const lastLoginSection = document.getElementById("admin-details-last-login-section")
    if (admin.lastLogin) {
      const lastLogin = new Date(admin.lastLogin.toDate()).toLocaleDateString()
      document.getElementById("admin-details-last-login").textContent = lastLogin
      lastLoginSection.style.display = "block"
    } else {
      lastLoginSection.style.display = "none"
    }

    // Show modal
    adminDetailsModal.style.display = "block"
  } catch (error) {
    console.error("Error loading admin details:", error)
    showAlert("Error loading admin details.", "error")
  }
}

// Close admin details modal
function closeAdminDetailsModal() {
  adminDetailsModal.style.display = "none"
}

// Create action buttons based on admin status
function createActionButtons(admin) {
  const adminStatus = getAdminStatus(admin)

  switch (adminStatus) {
    case "pending":
      return `
                <button class="btn-icon delete-btn" title="Delete Pending Admin" onclick="confirmDeletePendingAdmin('${admin.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            `
    case "active":
      return `
                <button class="btn-icon delete-btn" title="Block Admin" onclick="confirmBlockAdmin('${admin.id}')">
                    <i class="fas fa-ban"></i>
                </button>
            `
    case "blocked":
      return `
                <button class="btn-icon restore-btn" title="Unblock Admin" onclick="confirmUnblockAdmin('${admin.id}')">
                    <i class="fas fa-undo"></i>
                </button>
            `
    default:
      return ""
  }
}

// Handle individual admin selection
function handleAdminSelection(event) {
  const adminId = event.target.dataset.adminId

  if (event.target.checked) {
    selectedAdmins.add(adminId)
  } else {
    selectedAdmins.delete(adminId)
  }

  updateBulkActions()
  updateSelectAllCheckbox()
}

// Handle select all checkbox
function handleSelectAll() {
  const isChecked = selectAllCheckbox.checked

  if (isChecked) {
    // Select all filtered admins
    filteredAdmins.forEach((admin) => {
      selectedAdmins.add(admin.id)
    })
  } else {
    // Deselect all filtered admins
    filteredAdmins.forEach((admin) => {
      selectedAdmins.delete(admin.id)
    })
  }

  // Update individual checkboxes
  document.querySelectorAll(".admin-checkbox").forEach((checkbox) => {
    checkbox.checked = isChecked
  })

  updateBulkActions()
}

// Update select all checkbox state
function updateSelectAllCheckbox() {
  const filteredAdminIds = filteredAdmins.map((admin) => admin.id)
  const selectedFilteredAdmins = filteredAdminIds.filter((id) => selectedAdmins.has(id))

  if (selectedFilteredAdmins.length === 0) {
    selectAllCheckbox.checked = false
    selectAllCheckbox.indeterminate = false
  } else if (selectedFilteredAdmins.length === filteredAdminIds.length) {
    selectAllCheckbox.checked = true
    selectAllCheckbox.indeterminate = false
  } else {
    selectAllCheckbox.checked = false
    selectAllCheckbox.indeterminate = true
  }
}

// Update bulk actions visibility and state
function updateBulkActions() {
  const selectedCount = selectedAdmins.size
  selectedCountSpan.textContent = selectedCount

  if (selectedCount === 0) {
    bulkActionsBar.style.display = "none"
    return
  }

  bulkActionsBar.style.display = "flex"

  // Get selected admin data
  const selectedAdminData = allAdmins.filter((admin) => selectedAdmins.has(admin.id))

  // Check what actions are available based on ONLY the specific status types
  const pendingAdmins = selectedAdminData.filter((admin) => getAdminStatus(admin) === "pending")
  const activeAdmins = selectedAdminData.filter((admin) => getAdminStatus(admin) === "active")
  const blockedAdmins = selectedAdminData.filter((admin) => getAdminStatus(admin) === "blocked")

  // Show/hide bulk action buttons - only show if there are admins of that specific status
  bulkDeleteBtn.style.display = pendingAdmins.length > 0 ? "inline-flex" : "none"
  bulkBlockBtn.style.display = activeAdmins.length > 0 ? "inline-flex" : "none"
  bulkUnblockBtn.style.display = blockedAdmins.length > 0 ? "inline-flex" : "none"

  // Update button text to show count
  if (pendingAdmins.length > 0) {
    bulkDeleteBtn.innerHTML = `<i class="fas fa-trash"></i> Delete ${pendingAdmins.length} Pending`
  }
  if (activeAdmins.length > 0) {
    bulkBlockBtn.innerHTML = `<i class="fas fa-ban"></i> Block ${activeAdmins.length} Active`
  }
  if (blockedAdmins.length > 0) {
    bulkUnblockBtn.innerHTML = `<i class="fas fa-undo"></i> Unblock ${blockedAdmins.length} Blocked`
  }
}

// Handle bulk actions
function handleBulkAction(action) {
  currentBulkAction = action

  const selectedAdminData = allAdmins.filter((admin) => selectedAdmins.has(admin.id))

  let actionText, actionCount, eligibleAdmins

  switch (action) {
    case "delete":
      eligibleAdmins = selectedAdminData.filter((admin) => getAdminStatus(admin) === "pending")
      actionText = "Delete"
      actionCount = eligibleAdmins.length
      break
    case "block":
      eligibleAdmins = selectedAdminData.filter((admin) => getAdminStatus(admin) === "active")
      actionText = "Block"
      actionCount = eligibleAdmins.length
      break
    case "unblock":
      eligibleAdmins = selectedAdminData.filter((admin) => getAdminStatus(admin) === "blocked")
      actionText = "Unblock"
      actionCount = eligibleAdmins.length
      break
  }

  if (actionCount === 0) {
    showAlert(`No eligible admins selected for ${action} action.`, "warning")
    return
  }

  document.getElementById("bulk-confirmation-title").textContent = `Confirm Bulk ${actionText}`
  document.getElementById("bulk-confirmation-message").textContent =
    `Are you sure you want to ${action} ${actionCount} admin(s)? ${action === "delete" ? "This action cannot be undone." : ""}`
  document.getElementById("bulk-confirmation-password").value = ""

  const confirmButton = document.getElementById("bulk-confirm-action-btn")
  confirmButton.className = `btn ${action === "unblock" ? "btn-primary" : "btn-danger"}`
  confirmButton.textContent = `${actionText} ${actionCount} Admin(s)`

  bulkConfirmationModal.style.display = "block"
}

// Execute bulk action - COMPLETED IMPLEMENTATION
async function executeBulkAction() {
  if (!currentBulkAction) return

  const superAdminPassword = document.getElementById("bulk-confirmation-password").value

  if (!superAdminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmButton = document.getElementById("bulk-confirm-action-btn")
  confirmButton.disabled = true
  confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'

  try {
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, superAdminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    const selectedAdminData = allAdmins.filter((admin) => selectedAdmins.has(admin.id))
    let processedCount = 0
    const errors = []

    for (const admin of selectedAdminData) {
      const adminStatus = getAdminStatus(admin)

      try {
        let shouldProcess = false

        switch (currentBulkAction) {
          case "delete":
            if (adminStatus === "pending") {
              await deleteDoc(doc(db, "admins", admin.id))
              shouldProcess = true
              description = `Admin ${admin.name} deleted in bulk action`
            }
            break
          case "block":
            if (adminStatus === "active") {
              await updateDoc(doc(db, "admins", admin.id), {
                isActive: false,
                blockedAt: serverTimestamp(),
                blockedBy: currentUser.uid,
              })
              shouldProcess = true
              description = `Admin ${admin.name} blocked in bulk action`
            }
            break
          case "unblock":
            if (adminStatus === "blocked") {
              await updateDoc(doc(db, "admins", admin.id), {
                isActive: true,
                unblockedAt: serverTimestamp(),
                unblockedBy: currentUser.uid,
              })
              shouldProcess = true
              description = `Admin ${admin.name} unblocked in bulk action`
            }
            break
        }

        if (shouldProcess) {
          // Log the action
          await addDoc(collection(db, "admin_logs"), {
            action: `Bulk ${currentBulkAction} admin`,
            description: `${description}`,
            adminId: admin.id,
            adminEmail: admin.email,
            adminName: admin.name,
            performedBy: currentUser.uid,
            performedByEmail: currentUser.email,
            timestamp: serverTimestamp(),
          })

          processedCount++
        }
      } catch (error) {
        console.error(`Error processing admin ${admin.id}:`, error)
        errors.push(`${admin.name}: ${error.message}`)
      }
    }

    let act = currentBulkAction === "delete" ? "delet" : currentBulkAction === "block" ? "block" : "unblock"

    // Clear selections and reload
    selectedAdmins.clear()
    closeBulkConfirmationModal()

    if (errors.length > 0) {
      showAlert(`${processedCount} admin(s) processed successfully. ${errors.length} errors occurred.`, "warning")
      console.error("Bulk action errors:", errors)
    } else {
    //   showAlert(`${processedCount} admin(s) ${currentBulkAction}ed successfully.`, "success")
      showAlert(`${processedCount} admin(s) ${act}ed successfully.`, "success")
    }

    loadAdmins()
  } catch (error) {
    console.error("Error executing bulk action:", error)

    let errorMessage = `Error executing bulk ${currentBulkAction}.`

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect Super Admin password."
    }

    showAlert(errorMessage, "error")
  } finally {
    confirmButton.disabled = false
    confirmButton.textContent = `${currentBulkAction.charAt(0).toUpperCase() + currentBulkAction.slice(1)} Admin(s)`
  }
}

// Generate Admin ID
function generateAdminId() {
  const year = new Date().getFullYear()
  const randomNum = Math.floor(Math.random() * 900) + 100 // 3-digit random number
  return `ADM${year}${randomNum}`
}

// Open Add Admin Modal
function openAddModal() {
  // Generate and set Admin ID
  document.getElementById("admin-id").value = generateAdminId()

  // Clear form fields
  document.getElementById("admin-name").value = ""
  document.getElementById("admin-email").value = ""
  document.getElementById("super-admin-password").value = ""

  // Show modal
  addAdminModal.style.display = "block"
}

// Close Add Admin Modal
function closeAddModal() {
  addAdminModal.style.display = "none"
}

// Close Bulk Confirmation Modal
function closeBulkConfirmationModal() {
  bulkConfirmationModal.style.display = "none"
  currentBulkAction = null
}

// Add admin function - FIXED VERSION
async function addAdmin() {
  const adminId = document.getElementById("admin-id").value
  const name = document.getElementById("admin-name").value.trim()
  const email = document.getElementById("admin-email").value.trim()
  const superAdminPassword = document.getElementById("super-admin-password").value

  if (!name || !email || !superAdminPassword) {
    showAlert("Please fill in all fields.", "error")
    return
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    showAlert("Please enter a valid email address.", "error")
    return
  }

  const addButton = document.getElementById("add-admin-btn")
  addButton.disabled = true
  addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...'

  const currentUser = auth.currentUser

  try {
    // Step 1: Re-authenticate super admin
    const credential = EmailAuthProvider.credential(currentUser.email, superAdminPassword)
    await reauthenticateWithCredential(currentUser, credential)

    // Step 2: Check if email already exists in Firestore
    const existingAdminQuery = query(collection(db, "admins"), where("email", "==", email))
    const existingAdminSnapshot = await getDocs(existingAdminQuery)

    if (!existingAdminSnapshot.empty) {
      showAlert("An admin with this email already exists.", "error")
      return
    }

    // Step 3: Generate temporary password
    const tempPassword = generateTempPassword()

    // Step 4: Create admin document in Firestore using email as document ID
    const emailDocId = email.replace(/[.#$[\]]/g, "_") // Replace invalid Firestore ID characters

    await setDoc(doc(db, "admins", emailDocId), {
      adminId: adminId,
      name: name,
      email: email,
      role: "Admin",
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid,
      tempPassword: tempPassword,
      firstLogin: true,
      authAccountCreated: false, // Flag to track if Firebase Auth account exists
    })

    // Step 5: Log the action
    await addDoc(collection(db, "admin_logs"), {
      action: "Create admin record",
      description: `Admin ${name} created with email ${email}`,
      adminEmail: email,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
      note: "Admin record created, Firebase Auth account will be created on first login",
    })

    // Step 6: Send email with credentials
    try {
      if (typeof emailjs !== "undefined") {
        await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          {
            email: email,
            name: name,
            passcode: tempPassword,
          },
          EMAILJS_PUBLIC_KEY,
        )
        console.log("Email sent successfully")
      } else {
        console.warn("EmailJS not loaded, skipping email")
        showAlert(`Admin ${name} added successfully. Temporary password: ${tempPassword}`, "success")
      }
    } catch (emailError) {
      console.error("Error sending email:", emailError)
      showAlert(
        `Admin ${name} added successfully, but email failed to send. Temporary password: ${tempPassword}`,
        "warning",
      )
    }

    // Step 7: Close modal and reload
    closeAddModal()
    if (!showAlert.toString().includes("Temporary password")) {
      showAlert(`Admin ${name} added successfully. Login credentials sent via email.`, "success")
    }
    loadAdmins()
  } catch (error) {
    console.error("Error adding admin:", error)

    let errorMessage = "Error adding admin: "

    switch (error.code) {
      case "auth/wrong-password":
        errorMessage += "Incorrect Super Admin password."
        break
      default:
        errorMessage += error.message
    }

    showAlert(errorMessage, "error")
  } finally {
    addButton.disabled = false
    addButton.innerHTML = "Add Admin"
  }
}

// Confirm block admin
function confirmBlockAdmin(adminId) {
  currentAdminId = adminId
  currentAction = "block"

  document.getElementById("confirmation-title").textContent = "Block Admin"
  document.getElementById("confirmation-message").textContent =
    "Are you sure you want to block this admin? They will no longer be able to access the system."
  document.getElementById("confirmation-password").value = ""

  const confirmButton = document.getElementById("confirm-action-btn")
  confirmButton.className = "btn btn-danger"
  confirmButton.textContent = "Block Admin"
  confirmButton.onclick = blockAdmin

  confirmationModal.style.display = "block"
}

// Confirm unblock admin
function confirmUnblockAdmin(adminId) {
  currentAdminId = adminId
  currentAction = "unblock"

  document.getElementById("confirmation-title").textContent = "Unblock Admin"
  document.getElementById("confirmation-message").textContent =
    "Are you sure you want to unblock this admin? They will regain access to the system."
  document.getElementById("confirmation-password").value = ""

  const confirmButton = document.getElementById("confirm-action-btn")
  confirmButton.className = "btn btn-primary"
  confirmButton.textContent = "Unblock Admin"
  confirmButton.onclick = unblockAdmin

  confirmationModal.style.display = "block"
}

// Block admin
async function blockAdmin() {
  if (!currentAdminId) return

  const superAdminPassword = document.getElementById("confirmation-password").value

  if (!superAdminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmButton = document.getElementById("confirm-action-btn")
  confirmButton.disabled = true
  confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'

  try {
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, superAdminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    // Get admin data to log
    const adminDocRef = doc(db, "admins", currentAdminId)
    const adminDoc = await getDoc(adminDocRef)
    const adminData = adminDoc.data()

    // Update admin status in Firestore
    await updateDoc(adminDocRef, {
      isActive: false,
      blockedAt: serverTimestamp(),
      blockedBy: currentUser.uid,
    })

    // Log the action
    await addDoc(collection(db, "admin_logs"), {
      action: "Block admin",
      description: `Admin ${adminData.name} blocked by Super Admin`,
      adminId: currentAdminId,
      adminEmail: adminData.email,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    // Close modal and reload admins
    closeConfirmationModal()
    showAlert("Admin blocked successfully.", "success")
    loadAdmins()
  } catch (error) {
    console.error("Error blocking admin:", error)

    let errorMessage = "Error blocking admin."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect Super Admin password."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    confirmButton.disabled = false
    confirmButton.textContent = "Block Admin"
  }
}

// Unblock admin
async function unblockAdmin() {
  if (!currentAdminId) return

  const superAdminPassword = document.getElementById("confirmation-password").value

  if (!superAdminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmButton = document.getElementById("confirm-action-btn")
  confirmButton.disabled = true
  confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'

  try {
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, superAdminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    // Get admin data to log
    const adminDocRef = doc(db, "admins", currentAdminId)
    const adminDoc = await getDoc(adminDocRef)
    const adminData = adminDoc.data()

    // Update admin status in Firestore
    await updateDoc(adminDocRef, {
      isActive: true,
      unblockedAt: serverTimestamp(),
      unblockedBy: currentUser.uid,
    })

    // Log the action
    await addDoc(collection(db, "admin_logs"), {
      action: "Unblock admin",
      description: `Admin ${adminData.name} unblocked by Super Admin`,
      adminId: currentAdminId,
      adminEmail: adminData.email,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    // Close modal and reload admins
    closeConfirmationModal()
    showAlert("Admin unblocked successfully.", "success")
    loadAdmins()
  } catch (error) {
    console.error("Error unblocking admin:", error)

    let errorMessage = "Error unblocking admin."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect Super Admin password."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    confirmButton.disabled = false
    confirmButton.textContent = "Unblock Admin"
  }
}

// Close confirmation modal
function closeConfirmationModal() {
  confirmationModal.style.display = "none"
  currentAdminId = null
  currentAction = null
}

// Generate secure temporary password
function generateTempPassword() {
  // Ensure password contains:
  // - At least 6 characters
  // - At least one uppercase letter
  // - At least one lowercase letter
  // - At least one number
  // - At least one special character
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const lowercase = "abcdefghijklmnopqrstuvwxyz"
  const numbers = "0123456789"
  const special = "!@#$%^&*"
  const allChars = uppercase + lowercase + numbers + special

  let password = ""

  // Ensure one character from each required set
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length))
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length))
  password += numbers.charAt(Math.floor(Math.random() * numbers.length))
  password += special.charAt(Math.floor(Math.random() * special.length))

  // Fill the rest with random characters (8 more chars for total length of 12)
  for (let i = 0; i < 8; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length))
  }

  // Shuffle the password string
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("")
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

// Function to delete pending admin (before first login)
async function confirmDeletePendingAdmin(adminId) {
  currentAdminId = adminId
  currentAction = "delete_pending"

  document.getElementById("confirmation-title").textContent = "Delete Pending Admin"
  document.getElementById("confirmation-message").textContent =
    "Are you sure you want to delete this pending admin? This action cannot be undone."
  document.getElementById("confirmation-password").value = ""

  const confirmButton = document.getElementById("confirm-action-btn")
  confirmButton.className = "btn btn-danger"
  confirmButton.textContent = "Delete Admin"
  confirmButton.onclick = deletePendingAdmin

  confirmationModal.style.display = "block"
}

// Delete pending admin function
async function deletePendingAdmin() {
  if (!currentAdminId) return

  const superAdminPassword = document.getElementById("confirmation-password").value

  if (!superAdminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmButton = document.getElementById("confirm-action-btn")
  confirmButton.disabled = true
  confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'

  try {
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, superAdminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    // Get admin data to log
    const adminDocRef = doc(db, "admins", currentAdminId)
    const adminDoc = await getDoc(adminDocRef)
    const adminData = adminDoc.data()

    // Delete the pending admin document
    await deleteDoc(adminDocRef)

    // Log the action
    await addDoc(collection(db, "admin_logs"), {
      action: "Delete pending admin",
      description: `Pending admin ${adminData.name} deleted by Super Admin`,
      adminEmail: adminData.email,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    // Close modal and reload admins
    closeConfirmationModal()
    showAlert("Pending admin deleted successfully.", "success")
    loadAdmins()
  } catch (error) {
    console.error("Error deleting pending admin:", error)

    let errorMessage = "Error deleting pending admin."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect Super Admin password."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    confirmButton.disabled = false
    confirmButton.textContent = "Delete Admin"
  }
}

// Make functions globally available
window.openAddModal = openAddModal
window.closeAddModal = closeAddModal
window.addAdmin = addAdmin
window.confirmBlockAdmin = confirmBlockAdmin
window.confirmUnblockAdmin = confirmUnblockAdmin
window.confirmDeletePendingAdmin = confirmDeletePendingAdmin
window.closeConfirmationModal = closeConfirmationModal
window.closeBulkConfirmationModal = closeBulkConfirmationModal
window.executeBulkAction = executeBulkAction
window.closeAlert = closeAlert
window.showAdminDetails = showAdminDetails
window.closeAdminDetailsModal = closeAdminDetailsModal
