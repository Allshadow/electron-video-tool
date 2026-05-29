import sys
import json
import os
import subprocess

def ensure_demucs_installed():
    """检查并自动安装 demucs"""
    try:
        subprocess.check_call([sys.executable, '-m', 'demucs', '--help'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        sys.stderr.write("demucs 未安装，正在自动安装...\n")
        sys.stderr.flush()
        # 尝试多种安装方式
        install_cmds = [
            # 优先使用 pipx（不污染环境）
            ['pipx', 'install', 'demucs'],
            # 使用 --break-system-packages 绕过 PEP 668
            [sys.executable, '-m', 'pip', 'install', 'demucs', '--break-system-packages'],
            # 普通安装
            [sys.executable, '-m', 'pip', 'install', 'demucs'],
        ]
        for cmd in install_cmds:
            try:
                sys.stderr.write(f"尝试: {' '.join(cmd)}\n")
                sys.stderr.flush()
                subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                sys.stderr.write("demucs 安装完成\n")
                sys.stderr.flush()
                return True
            except (subprocess.CalledProcessError, FileNotFoundError):
                continue
        sys.stderr.write("自动安装失败，请手动执行: pip install demucs --break-system-packages\n")
        sys.stderr.flush()
        return False

def separate_audio(input_file, output_dir):
    """
    使用 demucs 分离音频中的人声和背景音
    :param input_file: 输入音频/视频文件路径
    :param output_dir: 输出目录
    :return: 分离结果
    """
    try:
        # 确保输出目录存在
        os.makedirs(output_dir, exist_ok=True)

        # 通过命令行调用 demucs（兼容 demucs 4.x）
        cmd = [
            sys.executable, '-m', 'demucs',
            '--two-stems=vocals',
            '--mp3',
            '-o', output_dir,
            input_file
        ]

        # 实时输出进度到 stderr
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        # 实时读取输出并转发到 stderr（供 Electron 日志显示）
        for line in process.stdout:
            line = line.rstrip('\n')
            if line:
                sys.stderr.write(line + '\n')
                sys.stderr.flush()

        process.wait()

        if process.returncode == 0:
            return {
                "success": True,
                "message": "音频分离完成",
                "output_dir": output_dir
            }
        else:
            return {
                "success": False,
                "message": f"demucs 退出代码: {process.returncode}"
            }
    except FileNotFoundError:
        return {
            "success": False,
            "message": "demucs 未安装。请执行: pip install demucs"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"音频分离失败: {str(e)}"
        }

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(json.dumps({
            "success": False,
            "message": "参数错误: 需要提供输入文件和输出目录"
        }))
        sys.exit(1)

    input_file = sys.argv[1]
    output_dir = sys.argv[2]

    # 确保 demucs 已安装
    if not ensure_demucs_installed():
        print(json.dumps({
            "success": False,
            "message": "demucs 未安装且自动安装失败。请手动执行: pip install demucs"
        }))
        sys.exit(1)

    result = separate_audio(input_file, output_dir)
    print(json.dumps(result))
