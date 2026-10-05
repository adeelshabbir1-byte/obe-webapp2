"""
Local Timetable Solver - window version (double-click this, or the .exe).

1. Click Browse and choose the timetable-constraints.xlsx you downloaded from the portal.
2. Choose how long it may think, then click Start.
3. When it finishes, upload the timetable-solution.xlsx it saved back into the portal.
"""
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

import solve_timetable as st


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Local Timetable Solver")
        self.geometry("760x560")
        self.minsize(640, 460)
        self.q: "queue.Queue[str]" = queue.Queue()
        self.stop_event = threading.Event()
        self.worker = None
        self.out_path = ""

        pad = {"padx": 10, "pady": 4}
        top = ttk.Frame(self)
        top.pack(fill="x", **pad)
        ttk.Label(top, text="1. Constraints file from the portal:").grid(row=0, column=0, sticky="w")
        self.path_var = tk.StringVar()
        ttk.Entry(top, textvariable=self.path_var).grid(row=1, column=0, sticky="we", padx=(0, 6))
        ttk.Button(top, text="Browse...", command=self.browse).grid(row=1, column=1)
        top.columnconfigure(0, weight=1)

        opts = ttk.Frame(self)
        opts.pack(fill="x", **pad)
        ttk.Label(opts, text="2. Longest it may run (minutes):").pack(side="left")
        self.minutes = tk.StringVar(value="5")
        ttk.Spinbox(opts, from_=1, to=120, width=5, textvariable=self.minutes).pack(side="left", padx=6)
        self.labs_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(opts, text="Allow theory classes in lab rooms when lecture rooms are full",
                        variable=self.labs_var).pack(side="left", padx=14)

        btns = ttk.Frame(self)
        btns.pack(fill="x", **pad)
        self.start_btn = ttk.Button(btns, text="Start", command=self.start)
        self.start_btn.pack(side="left")
        self.stop_btn = ttk.Button(btns, text="Stop and use best so far", command=self.stop, state="disabled")
        self.stop_btn.pack(side="left", padx=8)
        self.open_btn = ttk.Button(btns, text="Open the folder with the result", command=self.open_folder, state="disabled")
        self.open_btn.pack(side="left")
        self.bar = ttk.Progressbar(self, mode="indeterminate")
        self.bar.pack(fill="x", **pad)

        self.log = scrolledtext.ScrolledText(self, height=18, font=("Consolas", 9), state="disabled")
        self.log.pack(fill="both", expand=True, **pad)
        self.say("Choose the constraints file, then click Start. Nothing leaves your computer.")
        self.after(150, self.pump)

    # ---- helpers
    def say(self, msg: str):
        self.log.configure(state="normal")
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def browse(self):
        p = filedialog.askopenfilename(title="Choose timetable-constraints.xlsx",
                                       filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")])
        if p:
            self.path_var.set(p)

    def start(self):
        path = self.path_var.get().strip()
        if not path or not os.path.isfile(path):
            messagebox.showwarning("Choose a file", "Please choose the timetable-constraints.xlsx file first.")
            return
        try:
            minutes = float(self.minutes.get())
        except ValueError:
            messagebox.showwarning("Minutes", "Please enter a number of minutes.")
            return
        self.stop_event.clear()
        self.start_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.open_btn.configure(state="disabled")
        self.bar.start(12)
        self.say("\n--- starting ---")
        allow_labs = self.labs_var.get()

        def work():
            try:
                res, out = st.run(path, None, time_limit_s=minutes * 60, allow_theory_in_labs=allow_labs,
                                  stop_event=self.stop_event, log=lambda m: self.q.put(m))
                self.out_path = out
                self.q.put("__DONE__")
            except Exception as e:  # noqa: BLE001 - show a friendly message
                self.q.put(f"ERROR: {e}")
                self.q.put("__FAIL__")

        self.worker = threading.Thread(target=work, daemon=True)
        self.worker.start()

    def stop(self):
        self.stop_event.set()
        self.say("Stopping - finishing the current step, then saving the best result so far...")
        self.stop_btn.configure(state="disabled")

    def open_folder(self):
        if not self.out_path:
            return
        folder = os.path.dirname(self.out_path)
        if sys.platform.startswith("win"):
            os.startfile(folder)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])

    def pump(self):
        try:
            while True:
                m = self.q.get_nowait()
                if m in ("__DONE__", "__FAIL__"):
                    self.bar.stop()
                    self.start_btn.configure(state="normal")
                    self.stop_btn.configure(state="disabled")
                    if m == "__DONE__":
                        self.open_btn.configure(state="normal")
                        messagebox.showinfo("Finished", f"Saved:\n{self.out_path}\n\nNow upload this file in the portal "
                                                        f"(Timetable > Generate & View > Option A).")
                else:
                    self.say(m)
        except queue.Empty:
            pass
        self.after(150, self.pump)


if __name__ == "__main__":
    App().mainloop()
