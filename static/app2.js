let ws;
let requestSeq = 1;
let pendingRequests = {};
let currentBreakpoints = {};
let currentThreadId = null;
let programPath = '';
let programLaunched = false;
let breakpointTimes = [];
let lastBreakpointTime = null;

function connect() {
    let address = document.getElementById("address").value;
    let port = document.getElementById("port").value;
    programPath = document.getElementById("programPath").value;

    programLaunched = false;

    ws = new WebSocket(`ws://${location.host}/ws`);

    ws.onopen = function() {
        console.log("Conectado al servidor WebSocket");

        let connectMessage = {
            command: "connect",
            address: address,
            port: port,
            programPath: programPath
        };
        ws.send(JSON.stringify(connectMessage));

        document.getElementById("connectButton").disabled = true;
        document.getElementById("disconnectButton").disabled = false;

        sendDAPRequest("initialize", { adapterID: "dlv" }, function(response) {
            console.log("Respuesta a 'initialize':", response);

            sendDAPRequest("launch", { program: programPath, stopOnEntry: true }, function(response) {
                console.log("Respuesta a 'launch':", response);
            });
        });

        refreshFiles();
    };

    ws.onmessage = function(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            data = event.data;
        }

        if (typeof data === 'string') {
            console.log("Mensaje del servidor:", data);
        } else if (Array.isArray(data)) {
            console.log("Lista de archivos recibida:", data);
            populateFileSelect(data);
        } else if (data.type === "event") {
            handleEvent(data);
        } else if (data.type === "response") {
            let seq = data.request_seq;
            if (pendingRequests[seq]) {
                pendingRequests[seq](data);
                delete pendingRequests[seq];
            }
        } else {
            console.log("Mensaje DAP:", data);
        }
    };

    ws.onerror = function(event) {
        console.error("WebSocket error:", event);
    };

    ws.onclose = function() {
        console.log("WebSocket cerrado");
        document.getElementById("connectButton").disabled = false;
        document.getElementById("disconnectButton").disabled = true;
        clearAll();
        currentThreadId = null;
        programLaunched = false;
    };
}

function disconnect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        let message = {
            command: "disconnect"
        };
        ws.send(JSON.stringify(message));
        ws.close();
    }
}

function sendDAPRequest(command, args, callback) {
    let message = {
        type: "request",
        seq: requestSeq++,
        command: command,
        arguments: args
    };
    pendingRequests[message.seq] = callback;
    ws.send(JSON.stringify(message));
}

function handleEvent(data) {
    switch (data.event) {
        case "initialized":
            console.log("Evento 'initialized' recibido");
            setAllBreakpoints();
            sendDAPRequest("configurationDone", {}, function(response) {
                console.log("Respuesta a 'configurationDone':", response);
                programLaunched = true;
            });
            break;
        case "stopped":
            let threadId = data.body.threadId;
            currentThreadId = threadId;
            recordBreakpointTime();
            getStackTrace(threadId);
            break;
        case "continued":
            clearRunningCodeAndVariables();
            currentThreadId = null;
            break;
        default:
            console.log("Evento DAP:", data.event);
    }
}

function setBreakpoint() {
    let breakpointType = document.getElementById("breakpointType").value;
    let filePath = document.getElementById("filePath").value;

    if (breakpointType === 'line') {
        let line = parseInt(document.getElementById("lineNumber").value);
        if (!filePath || !line) {
            alert("Por favor, selecciona un archivo y especifica el número de línea.");
            return;
        }

        if (!currentBreakpoints[filePath]) {
            currentBreakpoints[filePath] = [];
        }
        if (!currentBreakpoints[filePath].includes(line)) {
            currentBreakpoints[filePath].push(line);
        }
    } else if (breakpointType === 'function') {
        let functionNameSelect = document.getElementById("functionName");
        let functionName = functionNameSelect.value;
        if (!functionName) {
            alert("Por favor, selecciona una función.");
            return;
        }
        let line = parseInt(functionNameSelect.options[functionNameSelect.selectedIndex].dataset.line);

        if (!currentBreakpoints[filePath]) {
            currentBreakpoints[filePath] = [];
        }
        if (!currentBreakpoints[filePath].includes(line)) {
            currentBreakpoints[filePath].push(line);
        }
    }

    updateBreakpointsList();

    if (programLaunched) {
        setAllBreakpoints();
    }
}

function setBreakpointsInFile(filePath) {
    let args = {
        source: {
            path: filePath
        },
        breakpoints: currentBreakpoints[filePath].map(line => ({ line: line }))
    };
    sendDAPRequest("setBreakpoints", args, function(response) {
        console.log("Respuesta a 'setBreakpoints':", response);
    });
}

function setAllBreakpoints() {
    for (let file in currentBreakpoints) {
        setBreakpointsInFile(file);
    }
}

function removeBreakpoint(filePath, line) {
    if (currentBreakpoints[filePath]) {
        currentBreakpoints[filePath] = currentBreakpoints[filePath].filter(l => l !== line);
        if (currentBreakpoints[filePath].length === 0) {
            delete currentBreakpoints[filePath];
        }

        updateBreakpointsList();

        if (programLaunched) {
            setBreakpointsInFile(filePath);
        }
    }
}

function updateBreakpointsList() {
    let breakpointsList = document.getElementById("breakpointsList");
    breakpointsList.innerHTML = '';

    for (let file in currentBreakpoints) {
        currentBreakpoints[file].forEach(line => {
            let listItem = document.createElement('li');
            listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
            listItem.textContent = `${file}:${line}`;

            let removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-danger';
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            removeBtn.onclick = function() {
                removeBreakpoint(file, line);
            };

            listItem.appendChild(removeBtn);
            breakpointsList.appendChild(listItem);
        });
    }
}

function continueExecution() {
    if (programLaunched) {
        sendDAPRequest("continue", {}, function(response) {
            console.log("Respuesta a 'continue':", response);
        });
        currentThreadId = null;
    } else {
        console.error("El programa aún no ha sido lanzado o no está listo para continuar.");
    }
}

function pause() {
    sendDAPRequest("pause", {}, function(response) {
        console.log("Respuesta a 'pause':", response);
    });
}

function stepIn() {
    if (currentThreadId !== null) {
        sendDAPRequest("stepIn", { threadId: currentThreadId }, function(response) {
            console.log("Respuesta a 'stepIn':", response);
        });
    } else {
        console.error("No hay threadId actual para 'stepIn'.");
    }
}

function stepOver() {
    if (currentThreadId !== null) {
        sendDAPRequest("next", { threadId: currentThreadId }, function(response) {
            console.log("Respuesta a 'next':", response);
        });
    } else {
        console.error("No hay threadId actual para 'stepOver'.");
    }
}

function stepOut() {
    if (currentThreadId !== null) {
        sendDAPRequest("stepOut", { threadId: currentThreadId }, function(response) {
            console.log("Respuesta a 'stepOut':", response);
        });
    } else {
        console.error("No hay threadId actual para 'stepOut'.");
    }
}

function refreshFiles() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        getGoFiles();
    } else {
        alert("No estás conectado al servidor.");
    }
}

function getGoFiles() {
    let message = {
        command: "getGoFiles"
    };
    ws.send(JSON.stringify(message));
}

function populateFileSelect(files) {
    let fileSelect = $('#filePath');
    fileSelect.empty();
    fileSelect.append('<option value="">Selecciona un archivo</option>');
    files.forEach(function(file) {
        let option = $('<option></option>').attr('value', file).text(file);
        fileSelect.append(option);
    });
}

function loadSourceCode() {
    let filePath = document.getElementById("filePath").value;
    if (!filePath) {
        document.getElementById("sourceCode").innerHTML = '';
        return;
    }

    fetch(`/source?filePath=${encodeURIComponent(filePath)}`)
        .then(response => response.text())
        .then(content => {
            let sourceCodeElement = document.getElementById("sourceCode");
            let lines = content.split('\n');
            sourceCodeElement.innerHTML = '';

            lines.forEach((line, index) => {
                let lineElem = document.createElement('div');
                lineElem.textContent = `${index + 1}: ${line}`;
                sourceCodeElement.appendChild(lineElem);
            });
        })
        .catch(err => console.error("Error al obtener el código fuente:", err));
}

function getStackTrace(threadId) {
    let args = {
        threadId: threadId,
        startFrame: 0,
        levels: 1
    };

    sendDAPRequest("stackTrace", args, function(response) {
        if (response.success) {
            let frames = response.body.stackFrames;
            if (frames.length > 0) {
                let frame = frames[0];
                console.log("Marco de pila:", frame);
                let source = frame.source;
                let line = frame.line;
                if (source && (source.path || source.sourceReference)) {
                    getRunningCode(source, line);
                } else {
                    console.error("Información de fuente no disponible en el marco de pila");
                }
                getScopes(frame.id);
            } else {
                console.error("No hay marcos de pila disponibles");
            }
        } else {
            console.error("Error al obtener el stack trace:", response.message);
        }
    });
}

function getRunningCode(source, lineNumber) {
    if (source.path || source.sourceReference) {
        let args = {
            source: source
        };

        sendDAPRequest("source", args, function(response) {
            if (response.success) {
                let content = response.body.content;
                let runningCodeElement = document.getElementById("runningCode");
                let lines = content.split('\n');
                runningCodeElement.innerHTML = '';

                let highlightedLineElem = null; // Variable para guardar el elemento de la línea resaltada

                lines.forEach((line, index) => {
                    let lineElem = document.createElement('div');
                    if (index + 1 === lineNumber) {
                        lineElem.classList.add('highlight');
                        highlightedLineElem = lineElem; // Guardamos el elemento de la línea resaltada
                    }
                    lineElem.textContent = `${index + 1}: ${line}`;
                    runningCodeElement.appendChild(lineElem);
                });

                // Desplazamos el contenedor para mostrar la línea resaltada
                if (highlightedLineElem) {
                    highlightedLineElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

            } else {
                console.error("Error al obtener el código en ejecución:", response.message);
                if (source.path) {
                    fetch(`/source?filePath=${encodeURIComponent(source.path)}`)
                        .then(response => response.text())
                        .then(content => {
                            let runningCodeElement = document.getElementById("runningCode");
                            let lines = content.split('\n');
                            runningCodeElement.innerHTML = '';

                            let highlightedLineElem = null; // Variable para guardar el elemento de la línea resaltada

                            lines.forEach((line, index) => {
                                let lineElem = document.createElement('div');
                                if (index + 1 === lineNumber) {
                                    lineElem.classList.add('highlight');
                                    highlightedLineElem = lineElem; // Guardamos el elemento de la línea resaltada
                                }
                                lineElem.textContent = `${index + 1}: ${line}`;
                                runningCodeElement.appendChild(lineElem);
                            });

                            // Desplazamos el contenedor para mostrar la línea resaltada
                            if (highlightedLineElem) {
                                highlightedLineElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }

                        })
                        .catch(err => console.error("Error al obtener el código desde el servidor:", err));
                }
            }
        });
    } else {
        console.error("No hay 'source.path' o 'sourceReference' disponible");
    }
}

function getScopes(frameId) {
    let args = {
        frameId: frameId
    };

    sendDAPRequest("scopes", args, function(response) {
        if (response.success) {
            let scopes = response.body.scopes;
            let variablesElement = document.getElementById("variables");
            variablesElement.innerHTML = '';

            scopes.forEach(scope => {
                let scopeHeader = document.createElement('div');
                scopeHeader.textContent = `Scope: ${scope.name}`;
                scopeHeader.style.fontWeight = 'bold';
                variablesElement.appendChild(scopeHeader);

                getVariables(scope.variablesReference, variablesElement);
            });
        } else {
            console.error("Error al obtener los scopes:", response.message);
        }
    });
}

function getVariables(variablesReference, variablesElement) {
    let args = {
        variablesReference: variablesReference
    };

    sendDAPRequest("variables", args, function(response) {
        if (response.success) {
            let variables = response.body.variables;
            console.log("Variables recibidas:", variables);

            variables.forEach(variable => {
                let varElem = document.createElement('div');
                varElem.textContent = `${variable.name}: ${variable.value}`;
                variablesElement.appendChild(varElem);

                // Si la variable tiene hijos, puedes expandirla aquí si lo deseas
            });
        } else {
            console.error("Error al obtener las variables:", response.message);
        }
    });
}

function clearRunningCodeAndVariables() {
    document.getElementById("runningCode").innerHTML = '';
    document.getElementById("variables").innerHTML = '';
}

function clearAll() {
    clearRunningCodeAndVariables();
    document.getElementById("sourceCode").innerHTML = '';
    document.getElementById("consoleOutput").innerHTML = '';
    document.getElementById("breakpointTimes").innerHTML = '';
    breakpointTimes = [];
    lastBreakpointTime = null;
}

function executeInConsole() {
    let expression = document.getElementById("consoleInput").value;
    if (!expression) return;

    if (currentThreadId === null) {
        console.error("El programa no está detenido. No se puede ejecutar código.");
        return;
    }

    let args = {
        expression: expression,
        frameId: 0,
        context: "repl"
    };

    sendDAPRequest("evaluate", args, function(response) {
        if (response.success) {
            let output = document.getElementById("consoleOutput");
            output.innerHTML += `> ${expression}\n${response.body.result}\n <br/>`;
            output.scrollTop = output.scrollHeight;
            document.getElementById("consoleInput").value = '';
        } else {
            console.error("Error al evaluar la expresión:", response.message);
        }
    });
}

function recordBreakpointTime() {
    let currentTime = new Date();
    if (lastBreakpointTime) {
        let elapsed = currentTime - lastBreakpointTime;
        breakpointTimes.push(elapsed);
        updateBreakpointTimes();
    }
    lastBreakpointTime = currentTime;
}

function updateBreakpointTimes() {
    let timesElement = document.getElementById("breakpointTimes");
    timesElement.innerHTML = '';
    breakpointTimes.forEach((time, index) => {
        let timeElem = document.createElement('div');
        timeElem.textContent = `Tiempo desde breakpoint ${index} a ${index + 1}: ${time} ms`;
        timesElement.appendChild(timeElem);
    });
}

function clearAllBreakpoints() {
    if (!confirm("¿Estás seguro de que deseas eliminar todos los breakpoints?")) {
        return;
    }
    // Guardar una copia de las claves actuales antes de limpiar
    let breakpointKeys = Object.keys(currentBreakpoints);

    // Limpiar los breakpoints locales
    currentBreakpoints = {};
    updateBreakpointsList();

    if (programLaunched) {
        // Enviar solicitudes para eliminar breakpoints en cada archivo
        breakpointKeys.forEach(key => {
            if (key.startsWith('function:')) {
                // Es un breakpoint de función, eliminamos todos los breakpoints de función
                sendDAPRequest("setFunctionBreakpoints", { breakpoints: [] }, function(response) {
                    console.log("Todos los breakpoints de función eliminados:", response);
                });
            } else {
                // Es un breakpoint de línea, enviamos una lista vacía para este archivo
                let args = {
                    source: {
                        path: key
                    },
                    breakpoints: [] // Lista vacía para eliminar breakpoints
                };
                sendDAPRequest("setBreakpoints", args, function(response) {
                    console.log(`Breakpoints en ${key} eliminados:`, response);
                });
            }
        });
    }
}


function getFunctionNames() {
    let filePath = document.getElementById("filePath").value;
    if (!filePath) {
        document.getElementById("functionName").innerHTML = '<option value="">Selecciona una función</option>';
        return;
    }

    fetch(`/functions?filePath=${encodeURIComponent(filePath)}`)
        .then(response => response.json())
        .then(functions => {
            let functionNameSelect = document.getElementById("functionName");
            functionNameSelect.innerHTML = '<option value="">Selecciona una función</option>';
            functions.forEach(func => {
                let option = document.createElement('option');
                option.value = func.name;
                option.textContent = `${func.name} (Línea ${func.line})`;
                option.dataset.line = func.line; // Guardamos la línea como atributo de datos
                functionNameSelect.appendChild(option);
            });
        })
        .catch(err => console.error("Error al obtener las funciones:", err));
}