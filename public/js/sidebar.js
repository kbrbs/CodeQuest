// Add these imports at the top of the file (add to existing imports)
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
import {
  onAuthStateChanged,
  getAuth,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail, // UPDATED: Using Firebase's native email verification
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"

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

// Cloudinary configuration for signed uploads
const CLOUDINARY_CONFIG = {
  cloudName: "dcquhfvnj",
  apiKey: "285345384234691",
  apiSecret: "71EZWZchzG_ekfwJLJi-oRdmYqs", 
  folder: "admin_profiles",
  transformation: "c_fill,w_400,h_400,q_auto,f_auto",
}

// Generate Cloudinary signature for secure uploads
function generateCloudinarySignature(params, apiSecret) {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&")

  // Create signature using SHA-1 (you'll need to include crypto-js library)
  return CryptoJS.SHA1(sortedParams + apiSecret).toString()
}

// Generate timestamp for signed upload
function getTimestamp() {
  return Math.round(new Date().getTime() / 1000)
}

// Sidebar functionality with role-based navigation
class SidebarManager {
  constructor() {
    this.userRole = this.getUserRole()
    this.name = null
    this.currentUser = null
    this.adminStatusListener = null
    this.currentAdminData = null
    this.currentProfileImage = null
    this.init()
  }

  init() {
    this.loadSidebar()
    this.setupAuthStateListener()
  }

  setupAuthStateListener() {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.currentUser = user
        this.setupAdminStatusMonitoring(user.uid)
        this.enforceRoleBasedRedirect()
      } else {
        this.currentUser = null
        this.cleanupAdminStatusMonitoring()
      }
    })
  }

  async enforceRoleBasedRedirect() {
    try {
      const user = auth.currentUser
      if (!user) return

      const adminDoc = await getDoc(doc(db, "admins", user.uid))
      if (!adminDoc.exists()) return

      const role = adminDoc.data().role

      // Get current path
      const path = window.location.pathname

      // If Admin tries to access Super Admin pages, redirect to admin dashboard
      if (role === "Admin" && path.includes("/superAdmin/")) {
        window.location.href = "/JavaRise/admin/dashboard.html"
        return
      }

      // If Super Admin tries to access Admin pages, redirect to super admin dashboard
      if (role === "Super Admin" && path.includes("/admin/") && !path.includes("/superAdmin/")) {
        window.location.href = "/JavaRise/superAdmin/dashboard.html"
        return
      }
    } catch (error) {
      console.error("Error enforcing role-based redirect:", error)
    }
  }

  setupAdminStatusMonitoring(userId) {
    // Clean up any existing listener
    this.cleanupAdminStatusMonitoring()

    // Set up real-time listener for admin status
    const adminRef = doc(db, "admins", userId)
    this.adminStatusListener = onSnapshot(
      adminRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const adminData = docSnap.data()
          this.currentAdminData = adminData
          this.name = adminData.adminId

          // Update profile image in sidebar
          this.updateSidebarProfileImage(adminData.profileImage)

          // Check if admin is blocked or not an admin
          if (adminData.role == "Admin" && !adminData.isActive) {
            this.handleBlockedAdmin()
          }
        } else {
          // Admin document doesn't exist - force logout
          alert("Check your internet connection.")
        }
      },
      (error) => {
        console.error("Error monitoring admin status:", error)
      },
    )
  }

  updateSidebarProfileImage(profileImageUrl) {
    const avatarImg = document.getElementById("user-avatar-img")
    const avatarIcon = document.getElementById("user-avatar-icon")

    if (profileImageUrl && avatarImg && avatarIcon) {
      avatarImg.src = profileImageUrl
      avatarImg.style.display = "block"
      avatarIcon.style.display = "none"
    } else if (avatarImg && avatarIcon) {
      avatarImg.style.display = "none"
      avatarIcon.style.display = "flex"
    }
  }

  cleanupAdminStatusMonitoring() {
    if (this.adminStatusListener) {
      this.adminStatusListener()
      this.adminStatusListener = null
    }
  }

  async handleBlockedAdmin() {
    try {
      // Show alert to user
      this.showBlockedAdminAlert()

      // Log the forced logout
      await this.logForcedLogout()

      // Sign out and redirect
      await signOut(auth)

      // Clear local storage
      localStorage.removeItem("userRole")

      // Redirect to login page
      window.location.href = "../index.html"
    } catch (error) {
      console.error("Error handling blocked admin:", error)
      // Force redirect even if logout fails
      window.location.href = "../index.html"
    }
  }

  showBlockedAdminAlert() {
    // Create and show a modal alert
    const alertHTML = `
      <div id="blocked-admin-alert" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      ">
        <div style="
          background: white;
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          max-width: 400px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        ">
          <div style="
            width: 60px;
            height: 60px;
            background-color: #dc3545;
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <i class="fas fa-ban" style="color: white; font-size: 24px;"></i>
          </div>
          <h3 style="color: #333; margin-bottom: 15px;">Account Blocked</h3>
          <p style="color: #666; margin-bottom: 20px; line-height: 1.5;">
            Your admin account has been blocked by the Super Admin. You will be logged out automatically.
          </p>
          <p style="color: #999; font-size: 14px;">
            Contact the Super Admin for assistance.
          </p>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML("beforeend", alertHTML)

    // Auto-remove after 3 seconds
    setTimeout(() => {
      const alert = document.getElementById("blocked-admin-alert")
      if (alert) {
        alert.remove()
      }
    }, 3000)
  }

  async logForcedLogout() {
    if (this.currentUser) {
      try {
        await addDoc(collection(db, "login_logs"), {
          userId: this.currentUser.uid,
          email: this.currentUser.email,
          role: this.userRole === "admin" ? "Admin" : "Super Admin",
          timestamp: serverTimestamp(),
          action: "Forced logout (blocked)",
          userAgent: navigator.userAgent,
          reason: "Admin account was blocked",
        })
        console.log("Forced logout activity logged")
      } catch (error) {
        console.error("Error logging forced logout activity:", error)
      }
    }
  }

  async loadSidebar() {
    try {
      const response = await fetch("../sidebar/sidebar.html")
      const sidebarHTML = await response.text()

      // Find the sidebar container or create one
      let sidebarContainer = document.getElementById("sidebar-container")
      if (!sidebarContainer) {
        sidebarContainer = document.createElement("div")
        sidebarContainer.id = "sidebar-container"
        document.body.insertBefore(sidebarContainer, document.body.firstChild)
      }

      sidebarContainer.innerHTML = sidebarHTML

      // Setup role-based navigation
      this.setupRoleBasedNavigation()

      // Set active nav item
      this.setActiveNavItem()

      // Setup logout button with confirmation
      this.setupLogoutButton()

      // Setup profile management and user dropdown
      this.setupProfileManagement()

      // Setup mobile sidebar toggle
      this.setupMobileSidebar()

      this.displayAdminName()
    } catch (error) {
      console.error("Error loading sidebar:", error)
    }
  }

  setupUserDropdown() {
    const userDetails = document.getElementById("user-details-clickable")
    const userDropdown = document.getElementById("user-dropdown")
    const dropdownArrow = document.getElementById("dropdown-arrow")

    if (!userDetails || !userDropdown) return

    // Toggle dropdown on click
    userDetails.addEventListener("click", (e) => {
      e.stopPropagation()
      const isActive = userDetails.classList.contains("active")

      if (isActive) {
        this.hideUserDropdown()
      } else {
        this.showUserDropdown()
      }
    })

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!userDetails.contains(e.target) && !userDropdown.contains(e.target)) {
        this.hideUserDropdown()
      }
    })

    // Close dropdown on escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideUserDropdown()
      }
    })

    // Prevent dropdown from closing when clicking inside it
    userDropdown.addEventListener("click", (e) => {
      e.stopPropagation()
    })
  }

  showUserDropdown() {
    const userDetails = document.getElementById("user-details-clickable")
    const userDropdown = document.getElementById("user-dropdown")

    if (userDetails && userDropdown) {
      userDetails.classList.add("active")
      userDropdown.classList.add("show")

      // Add a subtle animation delay for each dropdown item
      const dropdownItems = userDropdown.querySelectorAll(".dropdown-item")
      dropdownItems.forEach((item, index) => {
        item.style.opacity = "0"
        item.style.transform = "translateX(-10px)"
        setTimeout(() => {
          item.style.transition = "all 0.2s ease"
          item.style.opacity = "1"
          item.style.transform = "translateX(0)"
        }, index * 50)
      })
    }
  }

  hideUserDropdown() {
    const userDetails = document.getElementById("user-details-clickable")
    const userDropdown = document.getElementById("user-dropdown")

    if (userDetails && userDropdown) {
      userDetails.classList.remove("active")
      userDropdown.classList.remove("show")

      // Reset dropdown items animation
      const dropdownItems = userDropdown.querySelectorAll(".dropdown-item")
      dropdownItems.forEach((item) => {
        item.style.transition = ""
        item.style.opacity = ""
        item.style.transform = ""
      })
    }
  }

  setupProfileManagement() {
    // Setup user dropdown
    this.setupUserDropdown()

    // Setup Edit Profile button
    const editProfileBtn = document.getElementById("edit-profile-btn")
    if (editProfileBtn) {
      editProfileBtn.addEventListener("click", () => {
        this.hideUserDropdown()
        setTimeout(() => {
          this.showEditProfileModal()
        }, 200)
      })
    }

    // Auto-capitalize name input
    const nameInput = document.getElementById("edit-name")
    if (nameInput) {
      nameInput.addEventListener("input", function () {
        this.value = this.value.replace(/\b\w/g, c => c.toUpperCase())
      })
    }

    // Setup Change Password button
    const changePasswordBtn = document.getElementById("change-password-btn")
    if (changePasswordBtn) {
      changePasswordBtn.addEventListener("click", () => {
        this.hideUserDropdown()
        setTimeout(() => {
          this.showChangePasswordModal()
        }, 200)
      })
    }

    // Setup modal close handlers
    this.setupModalHandlers()

    // Setup image upload
    this.setupImageUpload()

    // Setup email change handlers (simplified)
    this.setupEmailChangeHandlers()
  }

  // SIMPLIFIED: Email change handlers without OTP
  setupEmailChangeHandlers() {
    const emailInput = document.getElementById("edit-email")
    const passwordSection = document.getElementById("current-password-section")
    const emailVerificationInfo = document.getElementById("email-verification-info")
    
    let originalEmail = ""

    if (emailInput && passwordSection) {
      // Store original email when modal opens
      const storeOriginalEmail = () => {
        originalEmail = this.currentUser?.email || ""
      }

      // Call this when modal opens
      setTimeout(storeOriginalEmail, 100)

      // Show/hide sections based on email change
      emailInput.addEventListener("input", () => {
        const currentEmail = emailInput.value.trim()
        const emailChanged = currentEmail !== originalEmail && currentEmail !== ""

        if (emailChanged) {
          passwordSection.style.display = "block"
          if (emailVerificationInfo) {
            emailVerificationInfo.style.display = "block"
          }
        } else {
          passwordSection.style.display = "none"
          if (emailVerificationInfo) {
            emailVerificationInfo.style.display = "none"
          }
        }
      })
    }
  }

  // Email validation
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  setupImageUpload() {
    const imageInput = document.getElementById("profile-image-input")
    if (imageInput) {
      imageInput.addEventListener("change", (e) => {
        this.handleImageUpload(e)
      })
    }
  }

  async handleImageUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      this.showNotification("Please select an image file", "error")
      return
    }

    // Validate file size (max 10MB for signed uploads)
    if (file.size > 10 * 1024 * 1024) {
      this.showNotification("Please select an image smaller than 10MB", "error")
      return
    }

    // Show upload progress
    this.showUploadProgress(true)

    try {
      // Generate timestamp and public_id
      const timestamp = getTimestamp()
      const publicId = `admin_${this.currentUser.uid}_${timestamp}`

      // Parameters for signature generation
      const params = {
        timestamp: timestamp,
        public_id: publicId,
        folder: CLOUDINARY_CONFIG.folder,
        transformation: CLOUDINARY_CONFIG.transformation,
      }

      // Generate signature
      const signature = generateCloudinarySignature(params, CLOUDINARY_CONFIG.apiSecret)

      // Prepare form data for signed upload
      const formData = new FormData()
      formData.append("file", file)
      formData.append("api_key", CLOUDINARY_CONFIG.apiKey)
      formData.append("timestamp", timestamp)
      formData.append("signature", signature)
      formData.append("public_id", publicId)
      formData.append("folder", CLOUDINARY_CONFIG.folder)
      formData.append("transformation", CLOUDINARY_CONFIG.transformation)

      // Upload to Cloudinary with signature
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || "Failed to upload image")
      }

      const data = await response.json()
      this.currentProfileImage = data.secure_url

      // Update preview
      this.updateImagePreview(data.secure_url)

      // Store additional Cloudinary metadata
      this.currentImageMetadata = {
        publicId: data.public_id,
        version: data.version,
        format: data.format,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
        createdAt: data.created_at,
      }

      this.showNotification("Image uploaded successfully!", "success")
    } catch (error) {
      console.error("Error uploading image:", error)
      this.showNotification(error.message || "Failed to upload image. Please try again.", "error")
    } finally {
      this.showUploadProgress(false)
    }
  }

  showUploadProgress(show) {
    const progressElement = document.getElementById("upload-progress")
    if (progressElement) {
      progressElement.style.display = show ? "block" : "none"

      if (show) {
        // Animate progress bar
        const progressFill = progressElement.querySelector(".progress-fill")
        if (progressFill) {
          let width = 0
          const interval = setInterval(() => {
            width += Math.random() * 30
            if (width > 90) width = 90
            progressFill.style.width = width + "%"
          }, 200)

          // Store interval to clear it later
          progressElement.dataset.interval = interval
        }
      } else {
        // Clear interval
        const interval = progressElement.dataset.interval
        if (interval) {
          clearInterval(interval)
        }
      }
    }
  }

  updateImagePreview(imageUrl) {
    const preview = document.getElementById("profile-preview")
    const placeholder = document.getElementById("profile-placeholder")

    if (preview && placeholder) {
      preview.src = imageUrl
      preview.style.display = "block"
      placeholder.style.display = "none"
    }
  }

  setupModalHandlers() {
    // Edit Profile Modal handlers
    const editProfileModal = document.getElementById("edit-profile-modal")
    // const closeEditProfile = document.getElementById("close-edit-profile")
    const cancelEditProfile = document.getElementById("cancel-edit-profile")
    const editProfileForm = document.getElementById("edit-profile-form")

    // if (closeEditProfile) {
    //   closeEditProfile.addEventListener("click", () => {
    //     this.hideEditProfileModal()
    //   })
    // }

    if (cancelEditProfile) {
      cancelEditProfile.addEventListener("click", () => {
        this.hideEditProfileModal()
      })
    }

    if (editProfileForm) {
      editProfileForm.addEventListener("submit", (e) => {
        e.preventDefault()
        this.handleEditProfile(e)
      })
    }

    // if (editProfileModal) {
    //   editProfileModal.addEventListener("click", (e) => {
    //     if (e.target === editProfileModal) {
    //       this.hideEditProfileModal()
    //     }
    //   })
    // }

    // Change Password Modal handlers
    const changePasswordModal = document.getElementById("change-password-modal")
    const closeChangePassword = document.getElementById("close-change-password")
    const cancelChangePassword = document.getElementById("cancel-change-password")
    const changePasswordForm = document.getElementById("change-password-form")

    if (closeChangePassword) {
      closeChangePassword.addEventListener("click", () => {
        this.hideChangePasswordModal()
      })
    }

    if (cancelChangePassword) {
      cancelChangePassword.addEventListener("click", () => {
        this.hideChangePasswordModal()
      })
    }

    if (changePasswordForm) {
      changePasswordForm.addEventListener("submit", (e) => {
        e.preventDefault()
        this.handleChangePassword(e)
      })
    }

    // if (changePasswordModal) {
    //   changePasswordModal.addEventListener("click", (e) => {
    //     if (e.target === changePasswordModal) {
    //       this.hideChangePasswordModal()
    //     }
    //   })
    // }
  }

  async showEditProfileModal() {
    if (!this.currentUser) return

    try {
      // Fetch current admin data
      const adminDoc = await getDoc(doc(db, "admins", this.currentUser.uid))
      if (!adminDoc.exists()) {
        this.showNotification("Error loading profile data", "error")
        return
      }

      const adminData = adminDoc.data()

      // Populate form fields - UPDATED: Use auth email instead of firestore email
      document.getElementById("edit-name").value = adminData.name || ""
      document.getElementById("edit-email").value = this.currentUser.email || "" // FROM AUTH

      // Clear password field
      const currentPasswordInput = document.getElementById("current-password-email")
      if (currentPasswordInput) {
        currentPasswordInput.value = ""
      }

      // Populate profile overview section
      document.getElementById("profile-admin-id").textContent = adminData.adminId || "N/A"
      document.getElementById("profile-role-badge").textContent = adminData.role || "Admin"

      // Format and display dates
      if (adminData.createdAt) {
        const createdDate = adminData.createdAt.toDate ? adminData.createdAt.toDate() : new Date(adminData.createdAt)
        document.getElementById("profile-created-at").textContent = this.formatDate(createdDate)
      }

      if (adminData.updatedAt) {
        const updatedDate = adminData.updatedAt.toDate ? adminData.updatedAt.toDate() : new Date(adminData.updatedAt)
        document.getElementById("profile-updated-at").textContent = this.formatDate(updatedDate)
      }

      // Set profile image
      this.currentProfileImage = adminData.profileImage || null
      if (adminData.profileImage) {
        this.updateImagePreview(adminData.profileImage)
      } else {
        // Show placeholder
        const preview = document.getElementById("profile-preview")
        const placeholder = document.getElementById("profile-placeholder")
        if (preview && placeholder) {
          preview.style.display = "none"
          placeholder.style.display = "flex"
        }
      }

      // Hide or show admin ID and created at row based on role
      const adminIdRow = document.getElementById("profile-admin-id-row");
      const createdAtRow = document.getElementById("profile-created-at-row");

      if (adminData.role === "Super Admin") {
        if (adminIdRow) adminIdRow.style.display = "none";
        if (createdAtRow) createdAtRow.style.display = "none";
      } else {
        if (adminIdRow) adminIdRow.style.display = "flex";
        if (createdAtRow) createdAtRow.style.display = "flex";
      }

      // Hide email verification sections initially
      const passwordSection = document.getElementById("current-password-section")
      const emailVerificationInfo = document.getElementById("email-verification-info")
      if (passwordSection) passwordSection.style.display = "none"
      if (emailVerificationInfo) emailVerificationInfo.style.display = "none"

      // Show modal
      document.getElementById("edit-profile-modal").style.display = "flex"
    } catch (error) {
      console.error("Error loading profile data:", error)
      this.showNotification("Error loading profile data", "error")
    }
  }

  formatDate(date) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  hideEditProfileModal() {
    document.getElementById("edit-profile-modal").style.display = "none"
    // Reset form
    document.getElementById("edit-profile-form").reset()
    // Reset image preview
    this.currentProfileImage = null
    const preview = document.getElementById("profile-preview")
    const placeholder = document.getElementById("profile-placeholder")
    if (preview && placeholder) {
      preview.style.display = "none"
      placeholder.style.display = "flex"
    }
    // Hide sections
    const passwordSection = document.getElementById("current-password-section")
    const emailVerificationInfo = document.getElementById("email-verification-info")
    if (passwordSection) passwordSection.style.display = "none"
    if (emailVerificationInfo) emailVerificationInfo.style.display = "none"
  }

  // COMPLETELY REWRITTEN: Enhanced handleEditProfile with Firebase email verification
  async handleEditProfile(e) {
    const submitBtn = e.target.querySelector('button[type="submit"]')
    const originalText = submitBtn.innerHTML

    try {
      // Show loading state
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'
      submitBtn.classList.add("btn-loading")

      const formData = new FormData(e.target)
      const name = formData.get("name").trim()
      const newEmail = formData.get("email").trim()
      const currentPassword = formData.get("currentPassword")?.trim() || ""

      if (!name || !newEmail) {
        throw new Error("Please fill in all required fields")
      }

      // Get current admin data
      const adminRef = doc(db, "admins", this.currentUser.uid)
      const adminDoc = await getDoc(adminRef)
      if (!adminDoc.exists()) {
        throw new Error("Admin profile not found")
      }

      const currentAdminData = adminDoc.data()
      const oldEmail = this.currentUser.email // FROM AUTH instead of firestore
      const emailChanged = newEmail !== oldEmail

      // Handle email change with Firebase verification
      if (emailChanged) {
        await this.handleEmailChangeProcess(newEmail, currentPassword, oldEmail, adminRef, name)
      } else {
        // Just update name and other data (no reauthentication needed)
        await this.updateProfileDataOnly(name, newEmail, adminRef)
      }

      if (!emailChanged) {
        this.showNotification("Profile updated successfully!", "success")
        this.hideEditProfileModal()

        // Reload the page to reflect the updated information
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      }

    } catch (error) {
      console.error("Error updating profile:", error)
      this.showNotification(error.message || "Error updating profile", "error")
    } finally {
      // Reset button state
      submitBtn.innerHTML = originalText
      submitBtn.classList.remove("btn-loading")
    }
  }

  // UPDATED: Handle email change with Firebase verification link
  async handleEmailChangeProcess(newEmail, currentPassword, oldEmail, adminRef, name) {
    // Validation checks
    if (!currentPassword) {
      throw new Error("Current password is required to change email")
    }

    // Validate email format
    if (!this.isValidEmail(newEmail)) {
      throw new Error("Please enter a valid email address")
    }

    // Step 1: Reauthenticate with current password
    try {
      const credential = EmailAuthProvider.credential(this.currentUser.email, currentPassword)
      await reauthenticateWithCredential(this.currentUser, credential)
    } catch (authError) {
      if (authError.code === "auth/wrong-password") {
        throw new Error("Current password is incorrect")
      } else if (authError.code === "auth/too-many-requests") {
        throw new Error("Too many failed attempts. Please try again later")
      } else {
        throw new Error("Authentication failed. Please check your password")
      }
    }

    // Step 2: Send Firebase verification email for new email
    try {
      await verifyBeforeUpdateEmail(this.currentUser, newEmail)
      
      // Show success message with instructions
      this.showEmailVerificationModal(newEmail, name, adminRef)
      
    } catch (authError) {
      if (authError.code === "auth/email-already-in-use") {
        throw new Error("This email is already registered to another account")
      } else if (authError.code === "auth/invalid-email") {
        throw new Error("Invalid email format")
      } else if (authError.code === "auth/requires-recent-login") {
        throw new Error("Session expired. Please logout and login again")
      } else {
        throw new Error(`Failed to send verification email: ${authError.message}`)
      }
    }

    // Step 3: Log the email change attempt
    await addDoc(collection(db, "activity_logs"), {
      performedBy: this.currentUser.uid,
      email: oldEmail,
      role: this.userRole === "admin" ? "Admin" : "Super Admin",
      timestamp: serverTimestamp(),
      action: "Email change initiated",
      description: `Email change verification sent from ${oldEmail} to ${newEmail}`,
      oldEmail: oldEmail,
      newEmail: newEmail,
      verificationMethod: "Firebase Email Verification",
      userAgent: navigator.userAgent,
    })
  }

  // NEW METHOD: Show email verification modal with instructions
  showEmailVerificationModal(newEmail, name, adminRef) {
    this.hideEditProfileModal() // Close the edit profile modal

    const verificationHTML = `
      <div id="email-verification-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        animation: fadeIn 0.3s ease;
      ">
        <div style="
          background: white;
          padding: 40px;
          border-radius: 16px;
          text-align: center;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
        ">
          <div style="
            width: 80px;
            height: 80px;
            background: linear-gradient(45deg, #28a745, #20c997);
            border-radius: 50%;
            margin: 0 auto 25px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <i class="fas fa-envelope-open" style="color: white; font-size: 32px;"></i>
          </div>
          <h3 style="color: #333; margin-bottom: 20px; font-size: 24px;">Check Your Email</h3>
          <p style="color: #666; margin-bottom: 15px; line-height: 1.6; font-size: 16px;">
            We've sent a verification link to:
          </p>
          <div style="
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #28a745;
          ">
            <strong style="color: #28a745; font-size: 16px;">${newEmail}</strong>
          </div>
          <div style="text-align: left; margin: 25px 0;">
            <p style="color: #555; margin-bottom: 15px; font-weight: 600;">To complete your email change:</p>
            <ol style="color: #666; line-height: 1.8; padding-left: 20px;">
              <li>Check your inbox (and spam folder) for the verification email</li>
              <li>Click the verification link in the email</li>
              <li>Your email will be updated automatically</li>
              <li>You will be signed out and need to sign in again with your new email</li>
            </ol>
          </div>
          <div style="
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
          ">
            <i class="fas fa-exclamation-triangle" style="color: #856404; margin-right: 8px;"></i>
            <small style="color: #856404;">
              <strong>Important:</strong> Your profile name and image have been saved, but your email will only change after clicking the verification link.
            </small>
          </div>
          <button id="close-verification-modal" style="
            padding: 12px 30px;
            border: none;
            background: #28a745;
            color: white;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 16px;
            transition: all 0.2s ease;
            margin-top: 10px;
          ">Got It</button>
        </div>
      </div>
      
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            transform: translateY(50px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        #close-verification-modal:hover {
          background-color: #218838 !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
        }
      </style>
    `

    // Add modal to page
    document.body.insertAdjacentHTML("beforeend", verificationHTML)

    // Setup event listeners
    const modal = document.getElementById("email-verification-modal")
    const closeBtn = document.getElementById("close-verification-modal")

    // Close modal and force logout
  closeBtn.addEventListener("click", async () => {
    // Save profile name/image before logout
    await this.updateProfileDataOnly(name, this.currentUser.email, adminRef);

    // Notify about logout
    this.showNotification(
      "Email change initiated. You will now be logged out. Please verify your new email before signing in again.",
      "info"
    );

    // Log forced logout
    // await addDoc(collection(db, "login_logs"), {
    //   userId: this.currentUser.uid,
    //   email: this.currentUser.email,
    //   role: this.userRole === "admin" ? "Admin" : "Super Admin",
    //   timestamp: serverTimestamp(),
    //   action: "Forced logout (email change)",
    //   userAgent: navigator.userAgent,
    //   reason: `Email change to ${newEmail}`
    // });

    // Sign out and redirect
    setTimeout(async () => {
      await signOut(auth);
      localStorage.removeItem("userRole");
      window.location.href = "../index.html";
    }, 6000);
  });

    // Close on outside click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeBtn.click()
      }
    })

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closeBtn.click()
        document.removeEventListener("keydown", handleEscape)
      }
    }
    document.addEventListener("keydown", handleEscape)
  }

  // UPDATED: Update profile data without email change
  async updateProfileDataOnly(name, email, adminRef) {
    const updateData = {
      name: name,
      updatedAt: serverTimestamp(),
    }

    // Add profile image if changed
    if (this.currentProfileImage) {
      updateData.profileImage = this.currentProfileImage
      if (this.currentImageMetadata) {
        updateData.imageMetadata = this.currentImageMetadata
      }
    }

    await updateDoc(adminRef, updateData)

    // Log the profile update activity
    await addDoc(collection(db, "activity_logs"), {
      performedBy: this.currentUser.uid,
      email: this.currentUser.email,
      role: this.userRole === "admin" ? "Admin" : "Super Admin",
      timestamp: serverTimestamp(),
      action: "Profile updated",
      description: this.userRole == "admin" ? this.name + " updated their profile." : "You updated your profile.",
      userAgent: navigator.userAgent,
      changes: {
        name,
        email,
        profileImage: this.currentProfileImage,
        imageUpdated: !!this.currentProfileImage,
      },
    })
  }

  showChangePasswordModal() {
    document.getElementById("change-password-modal").style.display = "flex"
  }

  hideChangePasswordModal() {
    document.getElementById("change-password-modal").style.display = "none"
    // Reset form
    document.getElementById("change-password-form").reset()
  }

  async handleChangePassword(e) {
    const submitBtn = e.target.querySelector('button[type="submit"]')
    const originalText = submitBtn.innerHTML

    try {
      // Show loading state
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Changing...'
      submitBtn.classList.add("btn-loading")

      const formData = new FormData(e.target)
      const currentPassword = formData.get("currentPassword")
      const newPassword = formData.get("newPassword")
      const confirmPassword = formData.get("confirmPassword")

      // Validation
      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new Error("Please fill in all fields")
      }

      if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match")
      }

      if (newPassword.length < 6) {
        throw new Error("New password must be at least 6 characters long")
      }

      if (newPassword === currentPassword) {
        throw new Error("New password must be different from current password")
      }

      // Reauthenticate user
      const credential = EmailAuthProvider.credential(this.currentUser.email, currentPassword)
      await reauthenticateWithCredential(this.currentUser, credential)

      // Update password
      await updatePassword(this.currentUser, newPassword)

      // Update Firestore document with passwordChangedAt
      const adminRef = doc(db, "admins", this.currentUser.uid)
      await updateDoc(adminRef, {
        passwordChangedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Log the password change activity
      await addDoc(collection(db, "activity_logs"), {
        performedBy: this.currentUser.uid,
        email: this.currentUser.email,
        role: this.userRole === "admin" ? "Admin" : "Super Admin",
        timestamp: serverTimestamp(),
        action: "Password changed",
        description: this.userRole == "admin" ? this.name + " changed password." : "You changed your password",
        userAgent: navigator.userAgent,
      })

      this.showNotification("Password changed successfully!", "success")
      this.hideChangePasswordModal()
    } catch (error) {
      console.error("Error changing password:", error)
      let errorMessage = "Error changing password"

      if (error.code === "auth/wrong-password") {
        errorMessage = "Current password is incorrect"
      } else if (error.code === "auth/weak-password") {
        errorMessage = "New password is too weak"
      } else if (error.message) {
        errorMessage = error.message
      }

      this.showNotification(errorMessage, "error")
    } finally {
      // Reset button state
      submitBtn.innerHTML = originalText
      submitBtn.classList.remove("btn-loading")
    }
  }

  showNotification(message, type = "info") {
    const notification = document.createElement("div")
    notification.className = `notification ${type}`
    notification.innerHTML = `
      <div class="notification-content">
        <i class="fas ${type === "success" ? "fa-check-circle" : type === "error" ? "fa-exclamation-circle" : "fa-info-circle"}"></i>
        <span>${message}</span>
      </div>
    `

    document.body.appendChild(notification)

    // Auto remove after 5 seconds
    setTimeout(() => {
      notification.style.animation = "slideOutRight 0.3s ease"
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification)
        }
      }, 300)
    }, 5000)

    // Add click to dismiss
    notification.addEventListener("click", () => {
      notification.style.animation = "slideOutRight 0.3s ease"
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification)
        }
      }, 300)
    })
  }

  async displayAdminName() {
    const userNameDisplay = document.getElementById("user-status")
    if (!userNameDisplay) return

    onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed. Current user:", user)
      if (!user) {
        userNameDisplay.textContent = "Not signed in"
        return
      }

      try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid))
        if (adminDoc.exists()) {
          if (adminDoc.data().role === "Admin") {
            userNameDisplay.textContent = "Admin"
          } else {
            userNameDisplay.textContent = "Super Admin"
          }
        } else {
          userNameDisplay.textContent = "Unknown"
        }
      } catch (error) {
        console.error("Failed to fetch admin name:", error)
        userNameDisplay.textContent = "Admin"
      }
    })
  }

  setupRoleBasedNavigation() {
    const adminNav = document.querySelector(".admin-nav")
    const superAdminNav = document.querySelector(".super-admin-nav")
    const userRoleDisplay = document.getElementById("user-role-display")

    onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed. Current user:", user)
      if (!user) {
        userRoleDisplay.textContent = "Not signed in"
        return
      }

      try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid))

        if (adminDoc.exists()) {
          if (this.userRole === "admin") {
            adminNav.classList.add("active")
            superAdminNav.classList.remove("active")
            userRoleDisplay.textContent = adminDoc.data().name || "Admin"
          } else {
            adminNav.classList.remove("active")
            superAdminNav.classList.add("active")
            userRoleDisplay.textContent = adminDoc.data().name || "Admin"
          }
        }
      } catch (error) {
        console.error("Failed to fetch admin role:", error)
        userRoleDisplay.textContent = "Admin"
      }
    })
  }

  setActiveNavItem() {
    // Get current page name from URL
    const currentPage = this.getCurrentPageName()

    // Remove active class from all nav items
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active")
    })

    // Add active class to current page nav item in the active menu
    const activeMenu = this.userRole === "admin" ? ".admin-nav" : ".super-admin-nav"
    const currentNavItem = document.querySelector(`${activeMenu} [data-page="${currentPage}"]`)
    if (currentNavItem) {
      currentNavItem.classList.add("active")
    }
  }

  setupLogoutButton() {
    const logoutBtn = document.getElementById("logout-btn")
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault()
        this.hideUserDropdown()
        setTimeout(() => {
          this.showLogoutConfirmation()
        }, 200)
      })
    }
  }

  showLogoutConfirmation() {
    // Create logout confirmation modal
    const confirmationHTML = `
      <div id="logout-confirmation-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        animation: fadeIn 0.3s ease;
      ">
        <div style="
          background: white;
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
        ">
          <div style="
            width: 60px;
            height: 60px;
            background-color: #5a9025;
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <i class="fas fa-sign-out-alt" style="color: white; font-size: 24px;"></i>
          </div>
          <h3 style="color: #333; margin-bottom: 15px;">Confirm Logout</h3>
          <p style="color: #666; margin-bottom: 25px; line-height: 1.5;">
            Are you sure you want to logout from your admin account?
          </p>
          <div style="display: flex; gap: 15px; justify-content: center;">
            <button id="cancel-logout" style="
              padding: 10px 20px;
              border: 2px solid #6c757d;
              background: white;
              color: #6c757d;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 500;
              transition: all 0.2s ease;
            ">Cancel</button>
            <button id="confirm-logout" style="
              padding: 10px 20px;
              border: none;
              background: #dc3545;
              color: white;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 500;
              transition: all 0.2s ease;
            ">Logout</button>
          </div>
        </div>
      </div>
      
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            transform: translateY(50px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        #cancel-logout:hover {
          background-color: #6c757d !important;
          color: white !important;
        }
        
        #confirm-logout:hover {
          background-color: #c82333 !important;
        }
      </style>
    `

    // Add modal to page
    document.body.insertAdjacentHTML("beforeend", confirmationHTML)

    // Setup event listeners
    const modal = document.getElementById("logout-confirmation-modal")
    const cancelBtn = document.getElementById("cancel-logout")
    const confirmBtn = document.getElementById("confirm-logout")

    // Cancel logout
    cancelBtn.addEventListener("click", () => {
      modal.remove()
    })

    // Confirm logout
    confirmBtn.addEventListener("click", () => {
      modal.remove()
      this.logout()
    })

    // Close on outside click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove()
      }
    })

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        modal.remove()
        document.removeEventListener("keydown", handleEscape)
      }
    }
    document.addEventListener("keydown", handleEscape)
  }

  setupMobileSidebar() {
    const sidebarToggle = document.getElementById("sidebar-toggle")
    const sidebar = document.getElementById("sidebar")
    const overlay = document.getElementById("sidebar-overlay")

    if (sidebarToggle && sidebar && overlay) {
      // Toggle sidebar on hamburger icon click
      sidebarToggle.addEventListener("click", () => {
        sidebar.classList.toggle("active")
        overlay.classList.toggle("active")
        document.body.style.overflow = sidebar.classList.contains("active") ? "hidden" : ""
      })

      // Close sidebar when clicking on overlay
      overlay.addEventListener("click", () => {
        sidebar.classList.remove("active")
        overlay.classList.remove("active")
        document.body.style.overflow = ""
      })

      // Close sidebar when clicking on a menu item (mobile only)
      const navLinks = document.querySelectorAll(".nav-link")
      if (window.innerWidth <= 768) {
        navLinks.forEach((link) => {
          link.addEventListener("click", () => {
            sidebar.classList.remove("active")
            overlay.classList.remove("active")
            document.body.style.overflow = ""
          })
        })
      }

      // Handle resize events
      window.addEventListener("resize", () => {
        if (window.innerWidth > 768) {
          sidebar.classList.remove("active")
          overlay.classList.remove("active")
          document.body.style.overflow = ""
        }
      })
    }
  }

  async logout() {
    try {
      // Show loading state
      const logoutBtn = document.getElementById("logout-btn")
      if (logoutBtn) {
        logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'
        logoutBtn.disabled = true
      }

      // Log the logout activity
      await this.logLogoutActivity()

      // Clean up admin status monitoring
      this.cleanupAdminStatusMonitoring()

      // Sign out using the auth instance
      await signOut(auth)
      console.log("User signed out")

      // Clear local storage
      localStorage.removeItem("userRole")

      // Clear session storage
      sessionStorage.clear();

      // Redirect to login page
      window.location.href = "../index.html"
    } catch (error) {
      console.error("Error signing out:", error)

      // Reset logout button if error occurs
      const logoutBtn = document.getElementById("logout-btn")
      if (logoutBtn) {
        logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>'
        logoutBtn.disabled = false
      }

      // Show error message
      alert("Error logging out. Please try again.")
    }
  }

  async logLogoutActivity() {
    if (this.currentUser) {
      try {
        await addDoc(collection(db, "login_logs"), {
          userId: this.currentUser.uid,
          email: this.currentUser.email,
          role: this.userRole === "admin" ? "Admin" : "Super Admin",
          timestamp: serverTimestamp(),
          action: "logout",
          userAgent: navigator.userAgent,
        })
        console.log("Logout activity logged")
      } catch (error) {
        console.error("Error logging logout activity:", error)
      }
    }
  }

  getUserRole() {
    // Get role from localStorage or default to 'admin'
    return localStorage.getItem("userRole") || "admin"
  }

  getCurrentPageName() {
    const path = window.location.pathname
    const page = path.split("/").pop().replace(".html", "")

    // Handle index page
    if (page === "" || page === "index") {
      return "index"
    }

    return page
  }

  // Cleanup method to be called when the page unloads
  cleanup() {
    this.cleanupAdminStatusMonitoring()
  }
}

// Initialize sidebar when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.sidebarManager = new SidebarManager()
})

// Cleanup when page unloads
window.addEventListener("beforeunload", () => {
  if (window.sidebarManager) {
    window.sidebarManager.cleanup()
  }
})