# MCQ Scraper Frontend - Netlify Deployment Guide

## 🚀 NETLIFY DEPLOYMENT INSTRUCTIONS

### **Prerequisites**
- Netlify account (free tier works)
- Your backend deployed on Render (get the URL)
- GitHub repository with your frontend code

### **Step 1: Update Environment Variables**
1. Edit `.env.production` file
2. Replace `your-backend-app` with your actual Render app name:
   ```
   REACT_APP_BACKEND_URL=https://your-actual-backend-app.onrender.com
   ```

### **Step 2: Repository Setup**
1. Push your frontend code to GitHub
2. Make sure these files are in your repository root:
   - `netlify.toml` (Netlify configuration)
   - `frontend/` folder with all React app files
   - `frontend/package-production.json` (production dependencies)
   - `frontend/.env.production` (production environment variables)

### **Step 3: Deploy to Netlify**
1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Click "New site from Git"
3. Connect your GitHub repository
4. Configure build settings:
   - **Base directory**: `frontend`
   - **Build command**: `yarn build`
   - **Publish directory**: `frontend/build`

### **Step 4: Environment Variables**
In Netlify dashboard, go to Site settings → Environment variables:
```
REACT_APP_BACKEND_URL=https://your-backend-app.onrender.com
WDS_SOCKET_PORT=443
```

### **Step 5: Deploy**
1. Click "Deploy site"
2. Wait for deployment (2-5 minutes)
3. Your frontend will be available at: `https://your-app-name.netlify.app`

### **Step 6: Test Full Application**
1. Visit your Netlify URL
2. Test MCQ generation with both exam types (SSC/BPSC)
3. Test both PDF formats (text/image)
4. Verify all functionality works

### **Important Notes**
- ✅ Frontend connects to deployed backend
- ✅ Environment variables configured for production
- ✅ Build command optimized for Netlify
- ✅ Redirects configured for SPA routing
- ✅ Node.js version specified for consistency

### **Troubleshooting**
- If build fails, check Netlify build logs
- Ensure environment variables are set correctly
- Verify backend URL is accessible
- Check that backend is deployed and running

## 📝 Files Modified for Production
- `package-production.json`: Removed postinstall script
- `.env.production`: Production environment variables
- `netlify.toml`: Netlify build configuration
- All React components use environment variables for backend URL