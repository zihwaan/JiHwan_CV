# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install bash and build dependencies for node-pty
RUN apk add --no-cache bash python3 make g++ openssh-client

# Install app dependencies
RUN npm install

# Remove build dependencies to keep image small (Optional but recommended)
# RUN apk del python3 make g++

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the app
CMD [ "npm", "start" ]
