# GoFuji DAP Debugger Client with Go and Fiber

Welcome to the **DAP Debugger Client** project! This is a web-based application for debugging Go applications using the Debug Adapter Protocol (DAP) and Delve. Built with the **Fiber** web framework and using **WebSockets**, it provides an interactive, user-friendly GUI to help developers debug their applications with ease.

## Overview

This project aims to give developers a streamlined debugging experience through a web interface that lets you connect to a Delve DAP server, control the execution flow, set breakpoints, and inspect code and variables in real-time.

**Features:**

- **Live Debugging Interface**: Control program execution with commands like Continue, Pause, Step In, Step Over, and Step Out.
- **Breakpoint Management**: Set, remove, and view breakpoints by line or function name.
- **Code View**: Display source code with proper formatting, including preserved tabs and line numbers.
- **Variable Inspection**: Easily inspect variables within the current scope, including nested values.
- **Execution Timing**: Track time intervals between breakpoints to analyze performance.
- **Interactive Console**: Evaluate expressions within the current context and scope.

## Demo

<!-- Include a screenshot or GIF demonstrating the UI here -->
![DAP Debugger Client Demo](https://github.com/arturoeanton/gofuji/blob/main/demo.png?raw=true)
![Breakpoint Demo](https://github.com/arturoeanton/gofuji/blob/main/demo1.png?raw=true)
![Debugger Demo](https://github.com/arturoeanton/gofuji/blob/main/demo2.png?raw=true)
## Getting Started

To get this application running on your machine, follow these instructions.

### Prerequisites

- **Go** (version 1.16 or higher)
- **Delve** (Go debugger with DAP support)
- **Fiber** (version 2.0 or higher)
- **Node.js** and **npm** (optional, for managing frontend dependencies if you want to customize the UI; however, dependencies are loaded via CDN)

### Installation

1. **Clone the Repository**

    ```bash
    git clone https://github.com/yourusername/dap-debugger-client.git
    cd dap-debugger-client
    ```

2. **Install Go Dependencies**

    Make sure to install the dependencies required for the Fiber framework:

    ```bash
    go mod tidy
    ```

3. **Run Delve with DAP Support**

    Start your Go application using Delve in DAP mode. For example:

    ```bash
    dlv dap --listen=:12345 --api-version=2 --headless --log --log-output=dap,rpc ./path/to/your/main.go
    ```

    > **Note**: Replace `./path/to/your/main.go` with the path to your Go application.

4. **Run the Fiber Server**

    Start the Fiber server to serve the debugging client UI:

    ```bash
    go run main.go
    ```

5. **Access the Debugging UI**

    Open your browser and navigate to `http://localhost:3000` to access the DAP Debugger Client UI.

---

## Usage

### Connecting to a Delve DAP Server

1. **Enter Connection Details**:
    - **Address**: IP address of the Delve server (default: `127.0.0.1`)
    - **Port**: Port of the Delve server (default: `12345`)
    - **Program Path**: Path to the Go application to be debugged

2. **Click "Connect"**:
    - Once connected, you will see controls and options to manage breakpoints, inspect variables, and view code execution.

### Debugging Features

#### 1. **Execution Control**
    - Continue, Pause, Step In, Step Over, Step Out with dedicated controls.

#### 2. **Breakpoint Management**
    - Open the **Breakpoint Manager** to add breakpoints by:
        - **Line Number**: Set breakpoints at specific line numbers.
        - **Function Name**: Set breakpoints at the start of specific functions.
    - View all active breakpoints and delete them if necessary.
    - Track time elapsed between breakpoints.

#### 3. **Code View and Variable Inspection**
    - View the source code and highlight the current execution point.
    - Inspect variables and scope in real-time as the code executes.

#### 4. **Interactive Console**
    - Enter Go expressions in the console to evaluate in the current context and display the results immediately.

---

## Project Structure

```plaintext
├── main.go         # Main Go server file using Fiber
├── static/
│   ├── index2.html # Main HTML file for the client UI
│   ├── app2.js     # Main JavaScript file for client functionality
│   ├── styles.css  # Custom styles for the UI
└── README.md       # Project documentation
```

---

## Key Files and Components

### main.go

The server-side code for the Fiber application, which:
- Hosts a WebSocket endpoint for DAP communication.
- Provides an endpoint for fetching Go file information (e.g., functions and line numbers) for setting breakpoints.

### index2.html

The main HTML file that structures the layout of the DAP Debugger Client UI, including:
- **Execution Controls**
- **Breakpoint Manager** (in a modal for ease of use)
- **Console Output** and **Variable Viewer**

### app2.js

JavaScript functionality for the frontend, including:
- Handling WebSocket communication with the Fiber backend.
- Managing breakpoints, execution controls, and console evaluations.

---

## API Endpoints

### `/ws`
**WebSocket Endpoint**: Manages communication with the Delve debugger using the DAP.

### `/functions?filePath=path/to/file`
**Function Endpoint**: Provides a JSON list of functions and their line numbers for a specified Go source file, allowing breakpoints to be set by function name.

---

## Example Workflow

1. **Connect** to the debugger by providing the address, port, and program path.
2. **Set Breakpoints** by line number or function name.
3. **Control Execution** using the provided buttons (continue, pause, step).
4. **Inspect Variables** in the current scope as you step through the code.
5. **Evaluate Expressions** in the console for on-the-fly inspection and debugging.

---

## Technical Details

This project uses:
- **Go** for server-side logic and debugging protocols.
- **Fiber** as the web server for efficient, minimalistic API handling.
- **WebSockets** for real-time updates between client and server.
- **Bootstrap and Font Awesome** for UI styling.
- **Vanilla JavaScript** to manage the frontend interactions, including breakpoints and console evaluations.

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

---

## Future Enhancements

- **Persistent Breakpoints**: Save and load breakpoints across sessions.
- **Advanced Variable Inspection**: Support for complex types and nested data structures.
- **Enhanced Console Functionality**: Auto-complete, syntax highlighting, and additional context options.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Fiber**: For creating a powerful, minimalistic web framework for Go.
- **Delve**: For providing a robust debugging tool for Go developers.
- **DAP**: For defining a unified protocol for debuggers across languages and platforms.

---

Happy debugging! 

---