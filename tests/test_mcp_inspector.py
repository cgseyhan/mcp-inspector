import os
import sys
import io
import time
from playwright.sync_api import sync_playwright

# Force stdout to UTF-8 encoding for reliable Windows terminal logs
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Global configurations
URL = "http://localhost:5173/"
SCREENSHOT_DIR = r"C:\Users\cemgo\.gemini\antigravity-ide\brain\f5b7e72c-e9b4-4985-9b56-57c1f7d28332\scratch"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def ensure_disconnected_state(page):
    """Ensures that the interface is disconnected and in a clean state."""
    page.wait_for_load_state("networkidle")
    disconnect_btn = page.locator('button:has-text("Disconnect")')
    if disconnect_btn.count() > 0:
        print("  [Setup] Server is currently connected. Disconnecting for isolation...")
        disconnect_btn.click()
        page.wait_for_selector('.badge:has-text("DISCONNECTED")', timeout=5000)
        print("  [Setup] Disconnection verified. Starting clean test run.")
    else:
        print("  [Setup] Initial state is already clean and disconnected.")

def run_connection_lifecycle_test(page):
    """TEST 1: Verify the stdio connection and disconnection lifecycle."""
    print("\n--- Running Test 1: Stdio Connection Lifecycle ---")
    
    # 1. Verify initially disconnected
    status_badge = page.locator('.badge:has-text("DISCONNECTED")')
    assert status_badge.count() == 1, "Status badge should be DISCONNECTED initially"
    
    connect_btn = page.locator('button:has-text("Start Server / Connect")')
    assert connect_btn.count() == 1, "Connect button should be visible"
    print("  - Verified initial disconnected state and connect button.")
    
    # 2. Click connect
    print("  - Clicking 'Start Server / Connect'...")
    connect_btn.click()
    
    # 3. Verify connected state
    page.wait_for_selector('.badge:has-text("CONNECTED")', timeout=5000)
    assert page.locator('.badge:has-text("CONNECTED")').count() == 1, "Expected status to be CONNECTED"
    
    disconnect_btn = page.locator('button:has-text("Disconnect")')
    assert disconnect_btn.count() == 1, "Button should change to 'Disconnect'"
    print("  - Verified connected state and active disconnect button successfully!")

def run_performance_metrics_test(page):
    """TEST 2: Verify the digital metrics panel on the Performance tab."""
    print("\n--- Running Test 2: Real-time Performance Metrics ---")
    
    # 1. Select the Performance tab
    print("  - Switching to 'Performance' console tab...")
    page.locator('button:has-text("Performance")').click()
    
    # 2. Wait for telemetry streaming (poll interval is 1.5s, wait 3.5s to ensure update)
    print("  - Waiting for telemetry packets to stream and bind...")
    time.sleep(3.5)
    
    pid_card = page.locator('.perf-card:has-text("Alt Süreç PID")')
    cpu_card = page.locator('.perf-card:has-text("İşlemci (CPU)")')
    ram_card = page.locator('.perf-card:has-text("Bellek (RAM)")')
    
    pid_val = pid_card.locator('.perf-card-value').text_content().strip()
    cpu_val = cpu_card.locator('.perf-card-value').text_content().strip()
    ram_val = ram_card.locator('.perf-card-value').text_content().strip()
    
    print(f"  - Extracted telemetry values: PID={pid_val}, CPU={cpu_val}, RAM={ram_val}")
    
    # Assertions
    assert pid_val != "..." and pid_val.isdigit(), f"PID should be an active numeric string, got: {pid_val}"
    assert "%" in cpu_val and float(cpu_val.replace("%", "")) >= 0, f"CPU readout invalid: {cpu_val}"
    assert "MB" in ram_val and float(ram_val.replace("MB", "").strip()) >= 0, f"RAM readout invalid: {ram_val}"
    print("  - Digital neon resource readouts are active and mathematically valid!")

def run_svg_chart_test(page):
    """TEST 3: Verify the custom SVG chart elements and line rendering."""
    print("\n--- Running Test 3: Custom SVG Neon Chart Rendering ---")
    
    # We already waited 3.5s in Test 2. Let's wait another 3s to get a historical timeline (>=2 points)
    print("  - Waiting for additional history points...")
    time.sleep(3.0)
    
    svg = page.locator('svg.svg-chart')
    assert svg.count() == 1, "Custom SVG timeline chart must be rendered"
    
    # Assert gridlines and definitions
    grid_lines = svg.locator('.grid-line')
    print(f"  - SVG Gridlines found: {grid_lines.count()}")
    assert grid_lines.count() >= 6, f"Expected at least 6 gridlines, got: {grid_lines.count()}"
    
    # Assert gradient definitions and glowing paths
    cpu_path = svg.locator('.chart-path-cpu')
    mem_path = svg.locator('.chart-path-mem')
    assert cpu_path.count() == 1, "CPU neon line path is missing"
    assert mem_path.count() == 1, "Memory neon line path is missing"
    
    print("  - Custom SVG paths for CPU and Memory render beautifully!")
    
    # Screenshot of the active performance dashboard
    screenshot_path = os.path.join(SCREENSHOT_DIR, "performance_dashboard.png")
    page.screenshot(path=screenshot_path)
    print(f"  - Dashboard snapshot successfully saved to {screenshot_path}")

def run_sse_fallback_test(page):
    """TEST 4: Verify the SSE transport warning fallback states."""
    print("\n--- Running Test 4: SSE Fallback Warnings ---")
    
    # 1. Disconnect current connection first
    print("  - Disconnecting stdio connection for SSE test...")
    page.locator('button:has-text("Disconnect")').click()
    page.wait_for_selector('.badge:has-text("DISCONNECTED")', timeout=5000)
    
    # 2. Switch to SSE
    print("  - Switching transport type to 'SSE (Remote)'...")
    page.locator('button:has-text("SSE (Remote)")').click()
    
    # 3. Verify SSE warning card
    warning_card = page.locator('.perf-warning-card')
    assert warning_card.count() == 1, "Expected SSE informational warning card to be displayed"
    
    title = warning_card.locator('.perf-warning-title').text_content().strip()
    assert "DESTEKLENMİYOR" in title, f"Warning card title mismatch: {title}"
    print("  - SSE warning fallback states correctly handled and verified!")

def run_all_tests():
    print("====================================================")
    print("      MCP INSPECTOR AUTOMATED E2E TEST RUNNER")
    print("====================================================")
    
    with sync_playwright() as p:
        print("Launching headless Chromium...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        
        print(f"Navigating to {URL}...")
        page.goto(URL)
        
        # 1. Setup clean state
        ensure_disconnected_state(page)
        
        # 2. Run sequential E2E test cases
        try:
            run_connection_lifecycle_test(page)
            run_performance_metrics_test(page)
            run_svg_chart_test(page)
            run_sse_fallback_test(page)
            
            print("\n====================================================")
            print("  🎉 SUCCESS: ALL MCP INSPECTOR E2E TESTS PASSED PERFECTLY!")
            print("====================================================")
        except AssertionError as e:
            print(f"\n❌ TEST FAILURE: {e}")
            sys.exit(1)
        except Exception as e:
            print(f"\n❌ UNEXPECTED ERROR: {e}")
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    run_all_tests()
