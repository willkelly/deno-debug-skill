"""
Visualization tools for profiling and debugging data.

Provides:
- CPU flamegraphs
- Heap usage timelines
- Call tree visualizations
- Memory retention diagrams
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import Rectangle
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import json


def flamegraph(
    profile_data: Dict[str, Any],
    output_path: str,
    title: str = "CPU Flamegraph",
    min_pct: float = 0.1
) -> str:
    """
    Generate a flamegraph from CPU profile data.

    Args:
        profile_data: CPUProfile object or raw profile dict
        output_path: Where to save the image
        title: Title for the graph
        min_pct: Minimum percentage to show (filters tiny functions)

    Returns:
        Path to saved image
    """
    from scripts.cpu_profiler import CPUProfile

    # Handle both CPUProfile objects and dicts
    if not isinstance(profile_data, CPUProfile):
        profile = CPUProfile(profile_data)
    else:
        profile = profile_data

    fig, ax = plt.subplots(figsize=(16, 10))

    # Build flame stack
    flame_stack = _build_flame_stack(profile, min_pct)

    # Draw rectangles
    y_offset = 0
    max_y = 0
    colors = plt.cm.Set3(np.linspace(0, 1, 12))

    for level in flame_stack:
        for item in level:
            x = item['x']
            width = item['width']
            label = item['label']
            color_idx = hash(label) % len(colors)

            rect = Rectangle((x, y_offset), width, 1,
                           facecolor=colors[color_idx],
                           edgecolor='black',
                           linewidth=0.5)
            ax.add_patch(rect)

            # Add text if rectangle is wide enough
            if width > 0.02:  # Only show text for rectangles > 2% wide
                text_x = x + width / 2
                text = label if width > 0.1 else label.split('(')[0][:10]
                ax.text(text_x, y_offset + 0.5, text,
                       ha='center', va='center',
                       fontsize=8, color='black')

        y_offset += 1
        max_y = y_offset

    ax.set_xlim(0, 1)
    ax.set_ylim(0, max_y)
    ax.set_xlabel('Percentage of Total CPU Time')
    ax.set_ylabel('Stack Depth')
    ax.set_title(title, fontsize=14, fontweight='bold')

    # Remove y-axis ticks (depth is relative)
    ax.set_yticks([])

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"Flamegraph saved to {output_path}")
    return output_path


def _build_flame_stack(profile, min_pct: float) -> List[List[Dict]]:
    """Build flame stack structure from CPU profile."""
    # This is a simplified version - a full implementation would traverse the call tree
    # For now, we'll create a simple representation from hot functions

    hot_funcs = profile.get_hot_functions(limit=50)

    # Group by approximate stack depth (simplified)
    levels = defaultdict(list)

    x_offset = 0
    for _, row in hot_funcs.iterrows():
        pct = row['total_pct'] / 100
        if pct < min_pct / 100:
            continue

        # Simplified: put everything on one level
        # A real implementation would parse call tree structure
        level = 0
        width = pct

        levels[level].append({
            'x': x_offset,
            'width': width,
            'label': f"{row['function_name']} ({pct*100:.1f}%)"
        })

        x_offset += width

    return [levels[i] for i in sorted(levels.keys())]


def heap_timeline(
    snapshots: List[Dict[str, Any]],
    output_path: str,
    title: str = "Heap Memory Timeline"
) -> str:
    """
    Generate a timeline showing heap memory over time.

    Args:
        snapshots: List of snapshot metadata dicts with 'timestamp' and 'total_size'
        output_path: Where to save the image
        title: Title for the chart

    Returns:
        Path to saved image
    """
    df = pd.DataFrame(snapshots)

    if 'timestamp' not in df.columns or 'total_size' not in df.columns:
        # Try to compute from snapshot objects
        data = []
        for i, snap in enumerate(snapshots):
            if hasattr(snap, 'nodes'):
                total_size = sum(node.self_size for node in snap.nodes)
                data.append({'timestamp': i, 'total_size': total_size})
        df = pd.DataFrame(data)

    fig, ax = plt.subplots(figsize=(12, 6))

    # Convert size to MB
    df['size_mb'] = df['total_size'] / (1024 * 1024)

    ax.plot(df['timestamp'], df['size_mb'], marker='o', linewidth=2, markersize=8)
    ax.fill_between(df['timestamp'], df['size_mb'], alpha=0.3)

    ax.set_xlabel('Snapshot Number / Time', fontsize=12)
    ax.set_ylabel('Heap Size (MB)', fontsize=12)
    ax.set_title(title, fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3)

    # Annotate peaks
    max_idx = df['size_mb'].idxmax()
    max_val = df.loc[max_idx, 'size_mb']
    ax.annotate(f'Peak: {max_val:.1f} MB',
                xy=(df.loc[max_idx, 'timestamp'], max_val),
                xytext=(10, 10), textcoords='offset points',
                bbox=dict(boxstyle='round', facecolor='yellow', alpha=0.7),
                arrowprops=dict(arrowstyle='->', connectionstyle='arc3,rad=0'))

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"Heap timeline saved to {output_path}")
    return output_path


def call_tree_visualization(
    call_tree: List[Dict],
    output_path: str,
    max_depth: int = 5,
    title: str = "Call Tree"
) -> str:
    """
    Visualize a call tree as a hierarchical diagram.

    Args:
        call_tree: Call tree structure from CPUProfile.get_call_tree()
        output_path: Where to save the image
        max_depth: Maximum depth to visualize
        title: Title for the diagram

    Returns:
        Path to saved image
    """
    fig, ax = plt.subplots(figsize=(16, 12))

    # Flatten tree for visualization
    nodes = []
    _flatten_tree(call_tree, nodes, 0, 0, 1.0, max_depth)

    # Draw nodes
    for node in nodes:
        x, y, width, depth, label, samples = node

        # Color by sample count
        color_intensity = min(samples / 100, 1.0)
        color = plt.cm.YlOrRd(color_intensity)

        rect = Rectangle((x, y), width, 0.8,
                        facecolor=color,
                        edgecolor='black',
                        linewidth=1)
        ax.add_patch(rect)

        # Add label
        if width > 0.05:
            text_label = label if width > 0.2 else label[:15] + '...'
            ax.text(x + width/2, y + 0.4, f"{text_label}\n({samples})",
                   ha='center', va='center',
                   fontsize=8, color='black' if color_intensity < 0.5 else 'white')

    ax.set_xlim(0, 1)
    ax.set_ylim(-max_depth-1, 1)
    ax.set_xlabel('Relative Width (sample distribution)', fontsize=12)
    ax.set_ylabel('Call Depth', fontsize=12)
    ax.set_title(title, fontsize=14, fontweight='bold')
    ax.set_yticks(range(-max_depth, 1))
    ax.set_yticklabels([str(abs(i)) for i in range(-max_depth, 1)])

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"Call tree visualization saved to {output_path}")
    return output_path


def _flatten_tree(tree: List[Dict], nodes: List, depth: int, x_start: float, x_width: float, max_depth: int):
    """Flatten call tree for visualization."""
    if depth > max_depth or not tree:
        return

    for item in tree:
        if not item:
            continue

        label = item.get('function', '(anonymous)')
        samples = item.get('total_samples', 0)
        children = item.get('children', [])

        nodes.append((x_start, -depth, x_width, depth, label, samples))

        # Recursively add children
        if children and depth < max_depth:
            total_child_samples = sum(c.get('total_samples', 0) for c in children)
            child_x = x_start

            for child in children:
                child_samples = child.get('total_samples', 0)
                child_width = (child_samples / total_child_samples * x_width) if total_child_samples > 0 else x_width / len(children)

                _flatten_tree([child], nodes, depth + 1, child_x, child_width, max_depth)
                child_x += child_width


def memory_growth_chart(
    comparison_df: pd.DataFrame,
    output_path: str,
    top_n: int = 15,
    title: str = "Memory Growth by Object Type"
) -> str:
    """
    Create a bar chart showing memory growth.

    Args:
        comparison_df: DataFrame from heap_analyzer.compare_snapshots()
        output_path: Where to save the image
        top_n: Number of top growing objects to show
        title: Title for the chart

    Returns:
        Path to saved image
    """
    if comparison_df.empty:
        print("No data to visualize")
        return output_path

    # Get top growing objects
    df = comparison_df.nlargest(top_n, 'size_delta').copy()

    # Convert to MB
    df['size_delta_mb'] = df['size_delta'] / (1024 * 1024)

    # Create labels
    df['label'] = df['name'].str[:30] + ' (' + df['node_type'] + ')'

    fig, ax = plt.subplots(figsize=(12, 8))

    bars = ax.barh(df['label'], df['size_delta_mb'])

    # Color bars by growth amount
    colors = plt.cm.RdYlGn_r(np.linspace(0.2, 0.8, len(bars)))
    for bar, color in zip(bars, colors):
        bar.set_color(color)

    ax.set_xlabel('Memory Growth (MB)', fontsize=12)
    ax.set_title(title, fontsize=14, fontweight='bold')
    ax.grid(axis='x', alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"Memory growth chart saved to {output_path}")
    return output_path


def investigation_timeline_chart(
    breadcrumbs,
    output_path: str,
    title: str = "Investigation Timeline"
) -> str:
    """
    Visualize investigation breadcrumbs as a timeline.

    Args:
        breadcrumbs: Breadcrumbs object
        output_path: Where to save the image
        title: Title for the chart

    Returns:
        Path to saved image
    """
    from datetime import datetime

    if not breadcrumbs.breadcrumbs:
        print("No breadcrumbs to visualize")
        return output_path

    # Prepare data
    data = []
    for bc in breadcrumbs.breadcrumbs:
        data.append({
            'timestamp': datetime.fromisoformat(bc.timestamp),
            'type': bc.type,
            'description': bc.description[:50] + '...' if len(bc.description) > 50 else bc.description
        })

    df = pd.DataFrame(data)

    # Calculate relative time in seconds
    start_time = df['timestamp'].min()
    df['time_sec'] = (df['timestamp'] - start_time).dt.total_seconds()

    # Create figure
    fig, ax = plt.subplots(figsize=(14, 8))

    # Color mapping for types
    type_colors = {
        'hypothesis': '#FFA500',
        'test': '#4169E1',
        'finding': '#32CD32',
        'decision': '#FF6347',
        'data': '#9370DB',
        'note': '#A9A9A9',
        'question': '#FFD700'
    }

    # Plot points
    for type_name, color in type_colors.items():
        mask = df['type'] == type_name
        if mask.any():
            ax.scatter(df[mask]['time_sec'], [type_name] * mask.sum(),
                      s=200, c=color, alpha=0.7, edgecolors='black', linewidth=1.5,
                      label=type_name.capitalize())

    # Add labels for key events
    for _, row in df.iterrows():
        ax.annotate(row['description'],
                   xy=(row['time_sec'], row['type']),
                   xytext=(10, 0), textcoords='offset points',
                   fontsize=8, alpha=0.7,
                   bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.3))

    ax.set_xlabel('Time (seconds)', fontsize=12)
    ax.set_ylabel('Event Type', fontsize=12)
    ax.set_title(title, fontsize=14, fontweight='bold')
    ax.legend(loc='upper left', bbox_to_anchor=(1, 1))
    ax.grid(axis='x', alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()

    print(f"Investigation timeline chart saved to {output_path}")
    return output_path


if __name__ == '__main__':
    print("Visualize - Example Usage")
    print("==========================")
    print()
    print("# Generate flamegraph")
    print("from scripts.cpu_profiler import load_profile")
    print("profile = load_profile('profile.cpuprofile')")
    print("flamegraph(profile, 'flamegraph.png')")
    print()
    print("# Heap timeline")
    print("snapshots = [")
    print("    {'timestamp': 0, 'total_size': 10*1024*1024},")
    print("    {'timestamp': 1, 'total_size': 15*1024*1024},")
    print("    {'timestamp': 2, 'total_size': 25*1024*1024},")
    print("]")
    print("heap_timeline(snapshots, 'heap_timeline.png')")
    print()
    print("# Memory growth chart")
    print("from scripts.heap_analyzer import compare_snapshots")
    print("comparison = compare_snapshots(before, after)")
    print("memory_growth_chart(comparison, 'growth.png')")
